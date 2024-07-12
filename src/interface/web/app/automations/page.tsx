'use client'

import useSWR from 'swr';
import Loading, { InlineLoading } from '../components/loading/loading';
import {
    Card,
    CardDescription,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle

} from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface AutomationsData {
    id: number;
    subject: string;
    query_to_run: string;
    scheduling_request: string;
    schedule: string;
    crontime: string;
    next: string;
}

import cronstrue from 'cronstrue';
import { zodResolver } from "@hookform/resolvers/zod"
import { UseFormReturn, useForm } from "react-hook-form"
import { z } from "zod"
import { Suspense, useEffect, useState } from 'react';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { DialogTitle } from '@radix-ui/react-dialog';
import { Textarea } from '@/components/ui/textarea';
import { LocationData, useIPLocationData } from '../common/utils';

import styles from './automations.module.css';
import ShareLink from '../components/shareLink/shareLink';
import { useSearchParams } from 'next/navigation';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { DotsThreeVertical, Pencil, Play, Trash } from '@phosphor-icons/react';
import { useAuthenticatedData } from '../common/auth';
import LoginPrompt from '../components/loginPrompt/loginPrompt';
import { useToast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';

const automationsFetcher = () => window.fetch('/api/automations').then(res => res.json()).catch(err => console.log(err));

function getEveryBlahFromCron(cron: string) {
    const cronParts = cron.split(' ');
    if (cronParts[2] === '*') {
        return 'Day';
    }
    if (cronParts[4] === '*') {
        return 'Week';
    }
    return 'Month';
}

function getDayIntervalFromCron(cron: string) {
    const cronParts = cron.split(' ');
    if (cronParts[4] === '*') {
        return cronParts[5];
    }
    return '';
}

function getTimeRecurrenceFromCron(cron: string) {
    const cronParts = cron.split(' ');
    const hour = cronParts[1];
    const minute = cronParts[0];
    const period = Number(hour) >= 12 ? 'PM' : 'AM';

    let friendlyHour = Number(hour) > 12 ? Number(hour) - 12 : hour;
    if (friendlyHour === '00') {
        friendlyHour = '12';
    }

    let friendlyMinute = minute;
    if (Number(friendlyMinute) < 10 && friendlyMinute !== '00') {
        friendlyMinute = `0${friendlyMinute}`;
    }
    return `${friendlyHour}:${friendlyMinute} ${period}`;
}

function getDayOfMonthFromCron(cron: string) {
    const cronParts = cron.split(' ');
    if (cronParts[2] === '*') {
        return cronParts[3];
    }
    return '';
}

function cronToHumanReadableString(cron: string) {
    return cronstrue.toString(cron);
}

const frequencies = ['Day', 'Week', 'Month'];

const dayIntervals = Array.from({ length: 31 }, (_, i) => i + 1);

const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const timeOptions: string[] = [];

const timePeriods = ['AM', 'PM'];

// Populate the time selector with options for each hour of the day
for (var i = 0; i < timePeriods.length; i++) {
    for (var hour = 0; hour < 12; hour++) {
        for (var minute = 0; minute < 60; minute += 15) {
            // Ensure all minutes are two digits
            const paddedMinute = String(minute).padStart(2, '0');
            const friendlyHour = hour === 0 ? 12 : hour;
            timeOptions.push(`${friendlyHour}:${paddedMinute} ${timePeriods[i]}`);
        }
    }
}

const timestamp = Date.now();

const suggestedAutomationsMetadata: AutomationsData[] = [
    {
        "subject": "Weekly Newsletter",
        "query_to_run": "Compile a message including: 1. A recap of news from last week 2. A reminder to work out and stay hydrated 3. A quote to inspire me for the week ahead",
        "schedule": "9AM every Monday",
        "next": "Next run at 9AM on Monday",
        "crontime": "0 9 * * 1",
        "id": timestamp,
        "scheduling_request": "",
    },
    {
        "subject": "Daily Bedtime Story",
        "query_to_run": "Compose a bedtime story that a five-year-old might enjoy. It should not exceed five paragraphs. Appeal to the imagination, but weave in learnings.",
        "schedule": "9PM every night",
        "next": "Next run at 9PM today",
        "crontime": "0 21 * * *",
        "id": timestamp + 1,
        "scheduling_request": "",
    },
    {
        "subject": "Front Page of Hacker News",
        "query_to_run": "Summarize the top 5 posts from https://news.ycombinator.com/best and share them with me, including links",
        "schedule": "9PM on every Wednesday",
        "next": "Next run at 9PM on Wednesday",
        "crontime": "0 21 * * 3",
        "id": timestamp + 2,
        "scheduling_request": "",
    },
    {
        "subject": "Market Summary",
        "query_to_run": "Get the market summary for today and share it with me. Focus on tech stocks and the S&P 500.",
        "schedule": "9AM on every weekday",
        "next": "Next run at 9AM on Monday",
        "crontime": "0 9 * * 1-5",
        "id": timestamp + 3,
        "scheduling_request": "",
    }
];

function createShareLink(automation: AutomationsData) {
    const encodedSubject = encodeURIComponent(automation.subject);
    const encodedQuery = encodeURIComponent(automation.query_to_run);
    const encodedCrontime = encodeURIComponent(automation.crontime);

    const shareLink = `${window.location.origin}/automations?subject=${encodedSubject}&query=${encodedQuery}&crontime=${encodedCrontime}`;

    return shareLink;
}

function deleteAutomation(automationId: string, setIsDeleted: (isDeleted: boolean) => void) {
    fetch(`/api/automation?automation_id=${automationId}`, { method: 'DELETE' }
    ).then(response => response.json())
        .then(data => {
            setIsDeleted(true);
        });
}

function sendAPreview(automationId: string, setToastMessage: (toastMessage: string) => void) {
    fetch(`/api/trigger/automation?automation_id=${automationId}`, { method: 'POST' })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response;
        })
        .then(automations => {
            setToastMessage("Automation triggered. Check your inbox in a few minutes!");
        })
        .catch(error => {
            setToastMessage("Sorry, something went wrong. Try again later.");
        })
}

interface AutomationsCardProps {
    automation: AutomationsData;
    locationData?: LocationData | null;
    suggestedCard?: boolean;
    setNewAutomationData?: (data: AutomationsData) => void;
}


function AutomationsCard(props: AutomationsCardProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [updatedAutomationData, setUpdatedAutomationData] = useState<AutomationsData | null>(null);
    const [isDeleted, setIsDeleted] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const { toast } = useToast();

    const automation = props.automation;

    useEffect(() => {
        if (toastMessage) {
            toast({
                title: `Automation: ${updatedAutomationData?.subject || automation.subject}`,
                description: toastMessage,
                action: (
                    <ToastAction altText="Dismiss">Ok</ToastAction>
                ),
            })
            setToastMessage('');
        }
    }, [toastMessage]);

    if (isDeleted) {
        return null;
    }

    return (
        <Card className='hover:shadow-md rounded-lg bg-secondary h-full'>
            <CardHeader>
                <CardTitle className='line-clamp-2 leading-normal flex justify-between'>
                    {updatedAutomationData?.subject || automation.subject}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant={'ghost'}><DotsThreeVertical className='h-4 w-4' /></Button>
                        </PopoverTrigger>
                        <PopoverContent className='w-auto grid gap-2'>
                            <Button variant={'destructive'}
                                onClick={() => {
                                    deleteAutomation(automation.id.toString(), setIsDeleted);
                                }}>
                                <Trash className='h-4 w-4 mr-2' />Delete
                            </Button>
                            {
                                !props.suggestedCard && (
                                    <Dialog
                                        open={isEditing}
                                        onOpenChange={(open) => {
                                            setIsEditing(open);
                                        }}
                                    >
                                        <DialogTrigger asChild>
                                            <Button variant="outline">
                                                <Pencil className='h-4 w-4 mr-2' />Edit
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogTitle>Edit Automation</DialogTitle>
                                            <EditCard
                                                automation={automation}
                                                setIsEditing={setIsEditing}
                                                setUpdatedAutomationData={setUpdatedAutomationData}
                                                locationData={props.locationData} />
                                        </DialogContent>
                                    </Dialog>
                                )
                            }
                            {
                                !props.suggestedCard && (
                                    <Button variant={'outline'}
                                        onClick={() => {
                                            sendAPreview(automation.id.toString(), setToastMessage);
                                        }}>
                                        <Play className='h-4 w-4 mr-2' />Send Preview
                                    </Button>
                                )
                            }
                        </PopoverContent>
                    </Popover>

                </CardTitle>
                <CardDescription className='mt-2'>
                    {updatedAutomationData?.schedule || cronToHumanReadableString(automation.crontime)}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {updatedAutomationData?.query_to_run || automation.query_to_run}
            </CardContent>
            <CardFooter className="flex justify-end gap-2">
                {
                    props.suggestedCard && props.setNewAutomationData && (
                        <Dialog
                            open={isEditing}
                            onOpenChange={(open) => {
                                setIsEditing(open);
                            }}
                        >
                            <DialogTrigger asChild>
                                <Button variant="outline">Add</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogTitle>Add Automation</DialogTitle>
                                <EditCard
                                    createNew={true}
                                    automation={automation}
                                    setIsEditing={setIsEditing}
                                    setUpdatedAutomationData={props.setNewAutomationData}
                                    locationData={props.locationData} />
                            </DialogContent>
                        </Dialog>
                    )
                }
                <ShareLink
                    buttonTitle="Share"
                    buttonVariant={'outline' as keyof typeof buttonVariants}
                    title="Share Automation"
                    description="Copy the link below and share it with your friends."
                    url={createShareLink(automation)}
                    onShare={() => {
                        navigator.clipboard.writeText(createShareLink(automation));
                    }} />
            </CardFooter>
        </Card>
    )
}

interface SharedAutomationCardProps {
    locationData?: LocationData | null;
    setNewAutomationData: (data: AutomationsData) => void;
}

function SharedAutomationCard(props: SharedAutomationCardProps) {
    const searchParams = useSearchParams();
    const [isCreating, setIsCreating] = useState(true);

    const subject = searchParams.get('subject');
    const query = searchParams.get('query');
    const crontime = searchParams.get('crontime');

    if (!subject || !query || !crontime) {
        return null;
    }

    const automation: AutomationsData = {
        id: 0,
        subject: decodeURIComponent(subject),
        query_to_run: decodeURIComponent(query),
        scheduling_request: '',
        schedule: cronToHumanReadableString(decodeURIComponent(crontime)),
        crontime: decodeURIComponent(crontime),
        next: '',
    }

    return (
        <Dialog
            open={isCreating}
            onOpenChange={(open) => {
                setIsCreating(open);
            }}
        >
            <DialogTrigger>
            </DialogTrigger>
            <DialogContent>
                <DialogTitle>Create Automation</DialogTitle>
                <EditCard
                    createNew={true}
                    setIsEditing={setIsCreating}
                    setUpdatedAutomationData={props.setNewAutomationData}
                    automation={automation}
                    locationData={props.locationData} />
            </DialogContent>
        </Dialog>
    )
}

const EditAutomationSchema = z.object({
    subject: z.optional(z.string()),
    everyBlah: z.string({ required_error: "Every is required" }),
    dayInterval: z.optional(z.string()),
    dayOfMonth: z.optional(z.string()),
    timeRecurrence: z.string({ required_error: "Time Recurrence is required" }),
    queryToRun: z.string({ required_error: "Query to Run is required" }),
});

interface EditCardProps {
    automation?: AutomationsData;
    setIsEditing: (completed: boolean) => void;
    setUpdatedAutomationData: (data: AutomationsData) => void;
    locationData?: LocationData | null;
    createNew?: boolean;
}

function EditCard(props: EditCardProps) {
    const automation = props.automation;

    const form = useForm<z.infer<typeof EditAutomationSchema>>({
        resolver: zodResolver(EditAutomationSchema),
        defaultValues: {
            subject: automation?.subject,
            everyBlah: (automation?.crontime ? getEveryBlahFromCron(automation.crontime) : 'Day'),
            dayInterval: (automation?.crontime ? getDayIntervalFromCron(automation.crontime) : undefined),
            timeRecurrence: (automation?.crontime ? getTimeRecurrenceFromCron(automation.crontime) : '12:00 PM'),
            dayOfMonth: (automation?.crontime ? getDayOfMonthFromCron(automation.crontime) : "1"),
            queryToRun: automation?.query_to_run,
        },
    })

    const onSubmit = (values: z.infer<typeof EditAutomationSchema>) => {
        const cronFrequency = convertFrequencyToCron(values.everyBlah, values.timeRecurrence, values.dayInterval, values.dayOfMonth);

        let updateQueryUrl = `/api/automation?`;

        updateQueryUrl += `q=${values.queryToRun}`;

        if (automation?.id && !props.createNew) {
            updateQueryUrl += `&automation_id=${automation.id}`;
        }

        if (values.subject) {
            updateQueryUrl += `&subject=${values.subject}`;
        }

        updateQueryUrl += `&crontime=${cronFrequency}`;

        if (props.locationData) {
            updateQueryUrl += `&city=${props.locationData.city}`;
            updateQueryUrl += `&region=${props.locationData.region}`;
            updateQueryUrl += `&country=${props.locationData.country}`;
            updateQueryUrl += `&timezone=${props.locationData.timezone}`;
        }

        let method = props.createNew ? 'POST' : 'PUT';

        fetch(updateQueryUrl, { method: method })
            .then(response => response.json())
            .then
            ((data: AutomationsData) => {
                props.setIsEditing(false);
                props.setUpdatedAutomationData({
                    id: data.id,
                    subject: data.subject || '',
                    query_to_run: data.query_to_run,
                    scheduling_request: data.scheduling_request,
                    schedule: cronToHumanReadableString(data.crontime),
                    crontime: data.crontime,
                    next: data.next,
                });
            });
    }

    function convertFrequencyToCron(frequency: string, timeRecurrence: string, dayOfWeek?: string, dayOfMonth?: string) {
        let cronString = '';

        const minutes = timeRecurrence.split(':')[1].split(' ')[0];
        const period = timeRecurrence.split(':')[1].split(' ')[1];
        const rawHourAsNumber = Number(timeRecurrence.split(':')[0]);
        const hours = period === 'PM' && (rawHourAsNumber < 12) ? String(rawHourAsNumber + 12) : rawHourAsNumber;

        const dayOfWeekNumber = weekDays.indexOf(dayOfWeek || '');

        switch (frequency) {
            case 'Day':
                cronString = `${minutes} ${hours} * * *`;
                break;
            case 'Week':
                cronString = `${minutes} ${hours} * * ${dayOfWeekNumber}`;
                break;
            case 'Month':
                cronString = `${minutes} ${hours} ${dayOfMonth} * *`;
                break;
        }

        return cronString;
    }

    return (
        <AutomationModificationForm form={form} onSubmit={onSubmit} create={props.createNew} />
    )

}

interface AutomationModificationFormProps {
    form: UseFormReturn<z.infer<typeof EditAutomationSchema>>;
    onSubmit: (values: z.infer<typeof EditAutomationSchema>) => void;
    create?: boolean;
}

function AutomationModificationForm(props: AutomationModificationFormProps) {

    const [isSaving, setIsSaving] = useState(false);

    function recommendationPill(recommendationText: string, onChange: (value: any, event: React.MouseEvent<HTMLButtonElement>) => void) {
        return (
            <Button
                className='text-xs bg-slate-50 h-auto p-1.5 m-1 rounded-full'
                variant="ghost"
                key={recommendationText}
                onClick={(event) => {
                    event.preventDefault();
                    onChange({ target: { value: recommendationText } }, event);
                }}>
                {recommendationText}...
            </Button>
        )
    }

    const recommendationPills = [
        "Make a picture of",
        "Generate a summary of",
        "Create a newsletter of",
        "Notify me when"
    ];

    return (
        <Form {...props.form}>
            <form onSubmit={props.form.handleSubmit((values) => {
                props.onSubmit(values);
                setIsSaving(true);
            })} className="space-y-8">
                {
                    !props.create && (
                        <FormField
                            control={props.form.control}
                            name="subject"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Subject</FormLabel>
                                    <FormDescription>
                                        This is the subject of the email you'll receive.
                                    </FormDescription>
                                    <FormControl>
                                        <Input placeholder="Digest of Healthcare AI trends" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />)
                }

                <FormField
                    control={props.form.control}
                    name="everyBlah"
                    render={({ field }) => (
                        <FormItem
                            className='w-full'
                        >
                            <FormLabel>Frequency</FormLabel>
                            <FormDescription>
                                How frequently should this automation run?
                            </FormDescription>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger className='w-[200px]'>
                                        Every <SelectValue placeholder="" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {frequencies.map((frequency) => (
                                        <SelectItem key={frequency} value={frequency}>
                                            {frequency}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                {
                    props.form.watch('everyBlah') === 'Week' && (
                        <FormField
                            control={props.form.control}
                            name="dayInterval"
                            render={({ field }) => (
                                <FormItem
                                    className='w-full'>
                                    <FormLabel>Day of Week</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className='w-[200px]'>
                                                On <SelectValue placeholder="" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {
                                                weekDays.map((day) => (
                                                    <SelectItem key={day} value={day}>
                                                        {day}
                                                    </SelectItem>
                                                ))
                                            }
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    )
                }
                {
                    props.form.watch('everyBlah') === 'Month' && (
                        <FormField
                            control={props.form.control}
                            name="dayOfMonth"
                            render={({ field }) => (
                                <FormItem
                                    className='w-full'>
                                    <FormLabel>Day of Month</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className='w-[200px]'>
                                                On the <SelectValue placeholder="" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {
                                                dayIntervals.map((day) => (
                                                    <SelectItem key={day} value={String(day)}>
                                                        {day}
                                                    </SelectItem>
                                                ))
                                            }
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    )
                }
                {
                    (
                        props.form.watch('everyBlah') === 'Day' ||
                        props.form.watch('everyBlah') == 'Week' ||
                        props.form.watch('everyBlah') == 'Month') && (
                        <FormField
                            control={props.form.control}
                            name="timeRecurrence"
                            render={({ field }) => (
                                <FormItem
                                    className='w-full'>
                                    <FormLabel>Time</FormLabel>
                                    <FormDescription>
                                        On the days this automation runs, at what time should it run?
                                    </FormDescription>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className='w-[200px]'>
                                                At <SelectValue placeholder="" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {
                                                timeOptions.map((timeOption) => (
                                                    <SelectItem key={timeOption} value={timeOption}>
                                                        {timeOption}
                                                    </SelectItem>
                                                ))
                                            }
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    )
                }
                <FormField
                    control={props.form.control}
                    name="queryToRun"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Instructions</FormLabel>
                            <FormDescription>
                                What do you want Khoj to do?
                            </FormDescription>
                            {
                                props.create && (
                                    <div>
                                        {
                                            recommendationPills.map((recommendation) => recommendationPill(recommendation, field.onChange))
                                        }
                                    </div>
                                )
                            }
                            <FormControl>
                                <Textarea placeholder="Create a summary of the latest news about AI in healthcare." value={field.value} onChange={field.onChange} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <fieldset disabled={isSaving}>
                    {
                        isSaving ? (
                            <Button
                                type="submit"
                                disabled
                            >
                                Saving...
                            </Button>
                        ) : (
                            <Button type="submit">Save</Button>
                        )
                    }
                </fieldset>
            </form>
        </Form>
    )
}


export default function Automations() {
    const authenticatedData = useAuthenticatedData();
    const { data: personalAutomations, error, isLoading } = useSWR<AutomationsData[]>(authenticatedData ? 'automations' : null, automationsFetcher, { revalidateOnFocus: false });

    const [isCreating, setIsCreating] = useState(false);
    const [newAutomationData, setNewAutomationData] = useState<AutomationsData | null>(null);
    const [allNewAutomations, setAllNewAutomations] = useState<AutomationsData[]>([]);
    const [suggestedAutomations, setSuggestedAutomations] = useState<AutomationsData[]>([]);
    const [showLoginPrompt, setShowLoginPrompt] = useState(false);

    const ipLocationData = useIPLocationData();

    useEffect(() => {
        if (newAutomationData) {
            setAllNewAutomations([...allNewAutomations, newAutomationData]);
            setNewAutomationData(null);
        }
    }, [newAutomationData]);

    useEffect(() => {

        const allAutomations = personalAutomations ? personalAutomations.concat(allNewAutomations) : allNewAutomations;

        if (allAutomations) {
            setSuggestedAutomations(suggestedAutomationsMetadata.filter((suggestedAutomation) => {
                return allAutomations.find(
                    (automation) => suggestedAutomation.subject === automation.subject) === undefined;
            }));
        }
    }, [personalAutomations, allNewAutomations]);

    if (error) return <div>Failed to load</div>;

    if (isLoading) return <Loading />;

    return (
        <div>
            <h1>Automations</h1>
            {
                showLoginPrompt && (
                    <LoginPrompt
                        onOpenChange={setShowLoginPrompt}
                        loginRedirectMessage={"Create an account to make your own automation"} />
                )
            }
            {
                authenticatedData && (
                    <div className="mt-3">
                        Delivering to <span className='bg-accent text-accent-foreground rounded-full p-2'>{authenticatedData.email}</span>
                    </div>
                )
            }
            <h3
                className="text-4xl py-4">
                Your Automations
            </h3>
            <Suspense>
                <SharedAutomationCard
                    locationData={ipLocationData}
                    setNewAutomationData={setNewAutomationData} />
            </Suspense>
            {
                authenticatedData ? (
                    <Dialog
                        open={isCreating}
                        onOpenChange={(open) => {
                            setIsCreating(open);
                        }}
                    >
                        <DialogTrigger asChild className='fixed bottom-4 right-4'>
                            <Button variant="default">Create New</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogTitle>Create Automation</DialogTitle>
                            <EditCard
                                createNew={true}
                                setIsEditing={setIsCreating}
                                setUpdatedAutomationData={setNewAutomationData}
                                locationData={ipLocationData} />
                        </DialogContent>
                    </Dialog>
                )
                    : (
                        <Button
                            onClick={() => setShowLoginPrompt(true)}
                            className='fixed bottom-4 right-4' variant={'default'}>
                            Create New
                        </Button>
                    )
            }
            {
                ((!personalAutomations || personalAutomations.length === 0) && (allNewAutomations.length == 0)) && (
                    <div>
                        It's pretty empty here!
                    </div>
                )
            }
            <div
                className={`${styles.automationsLayout}`}>
                {
                    personalAutomations && personalAutomations.map((automation) => (
                        <AutomationsCard key={automation.id} automation={automation} locationData={ipLocationData} />
                    ))}
                {
                    allNewAutomations.map((automation) => (
                        <AutomationsCard key={automation.id} automation={automation} locationData={ipLocationData} />
                    ))
                }
            </div>
            <h3
                className="text-4xl py-4">
                Try these out
            </h3>
            <div
                className={`${styles.automationsLayout}`}>
                {
                    suggestedAutomations.map((automation) => (
                        <AutomationsCard
                            setNewAutomationData={setNewAutomationData}
                            key={automation.id}
                            automation={automation}
                            locationData={ipLocationData}
                            suggestedCard={true} />
                    ))
                }
            </div>
        </div>
    );
}