<<<<<<<< HEAD:src/khoj/database/migrations/0045_fileobject.py
# Generated by Django 4.2.11 on 2024-06-14 06:13
========
# Generated by Django 4.2.11 on 2024-06-14 05:17
>>>>>>>> c9496cb7 (small fixes and file summarization support for docx.):src/khoj/database/migrations/0044_conversation_file_filters_alter_entry_file_type_and_more.py

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("database", "0044_conversation_file_filters"),
    ]

    operations = [
<<<<<<<< HEAD:src/khoj/database/migrations/0045_fileobject.py
========
        migrations.AddField(
            model_name="conversation",
            name="file_filters",
            field=models.JSONField(default=list),
        ),
        migrations.AlterField(
            model_name="entry",
            name="file_type",
            field=models.CharField(
                choices=[
                    ("image", "Image"),
                    ("pdf", "Pdf"),
                    ("plaintext", "Plaintext"),
                    ("markdown", "Markdown"),
                    ("org", "Org"),
                    ("notion", "Notion"),
                    ("github", "Github"),
                    ("conversation", "Conversation"),
                    ("docx", "Docx"),
                ],
                default="plaintext",
                max_length=30,
            ),
        ),
>>>>>>>> c9496cb7 (small fixes and file summarization support for docx.):src/khoj/database/migrations/0044_conversation_file_filters_alter_entry_file_type_and_more.py
        migrations.CreateModel(
            name="FileObject",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("file_name", models.CharField(blank=True, default=None, max_length=400, null=True)),
                ("raw_text", models.TextField()),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        default=None,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "abstract": False,
            },
        ),
    ]
