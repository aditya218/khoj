import logging
from typing import List

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count, Q
from tqdm import tqdm

from khoj.database.adapters import get_default_search_model
from khoj.database.models import (
    Agent,
    Entry,
    KhojUser,
    SearchModelConfig,
    UserSearchModelConfig,
)
from khoj.processor.embeddings import EmbeddingsModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BATCH_SIZE = 1000  # Define an appropriate batch size


class Command(BaseCommand):
    help = "Convert all existing Entry objects to use a new default Search model."

    def add_arguments(self, parser):
        # Pass default SearchModelConfig ID
        parser.add_argument(
            "--search_model_id",
            action="store",
            help="ID of the SearchModelConfig object to set as the default search model for all existing Entry objects and UserSearchModelConfig objects.",
            required=True,
        )

        # Set the apply flag to apply the new default Search model to all existing Entry objects and UserSearchModelConfig objects.
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Apply the new default Search model to all existing Entry objects and UserSearchModelConfig objects. Otherwise, only display the number of Entry objects and UserSearchModelConfig objects that will be affected.",
        )

    def handle(self, *args, **options):
        @transaction.atomic
        def regenerate_entries(entry_filter: Q, embeddings_model: EmbeddingsModel, search_model: SearchModelConfig):
            total_entries = Entry.objects.filter(entry_filter).count()
            for start in tqdm(range(0, total_entries, BATCH_SIZE)):
                end = start + BATCH_SIZE
                entries = Entry.objects.filter(entry_filter)[start:end]
                compiled_entries = [entry.compiled for entry in entries]
                updated_entries: List[Entry] = []
                try:
                    embeddings = embeddings_model.embed_documents(compiled_entries)
                except Exception as e:
                    logger.error(f"Error embedding documents: {e}")
                    return

                for i, entry in enumerate(entries):
                    entry.embeddings = embeddings[i]
                    entry.search_model_id = search_model.id
                    updated_entries.append(entry)

                Entry.objects.bulk_update(updated_entries, ["embeddings", "search_model_id", "file_path"])

        search_model_config_id = options.get("search_model_id")
        apply = options.get("apply")

        logger.info(f"SearchModelConfig ID: {search_model_config_id}")
        logger.info(f"Apply: {apply}")

        embeddings_model = dict()

        search_models = SearchModelConfig.objects.all()
        for model in search_models:
            embeddings_model.update(
                {
                    model.name: EmbeddingsModel(
                        model.bi_encoder,
                        model.embeddings_inference_endpoint,
                        model.embeddings_inference_endpoint_api_key,
                        query_encode_kwargs=model.bi_encoder_query_encode_config,
                        docs_encode_kwargs=model.bi_encoder_docs_encode_config,
                        model_kwargs=model.bi_encoder_model_config,
                    )
                }
            )

        new_default_search_model_config = SearchModelConfig.objects.get(id=search_model_config_id)
        logger.info(f"New default Search model: {new_default_search_model_config}")
        user_search_model_configs_to_update = UserSearchModelConfig.objects.exclude(
            setting_id=search_model_config_id
        ).all()
        logger.info(f"Number of UserSearchModelConfig objects to update: {user_search_model_configs_to_update.count()}")

        for user_config in user_search_model_configs_to_update:
            affected_user = user_config.user
            entry_filter = Q(user=affected_user)
            relevant_entries = Entry.objects.filter(entry_filter).all()
            logger.info(f"Number of Entry objects to update for user {affected_user}: {relevant_entries.count()}")

            if apply:
                try:
                    regenerate_entries(
                        entry_filter,
                        embeddings_model[new_default_search_model_config.name],
                        new_default_search_model_config,
                    )
                    user_config.setting = new_default_search_model_config
                    user_config.save()

                    logger.info(
                        f"Updated UserSearchModelConfig object for user {affected_user} to use the new default Search model."
                    )
                    logger.info(
                        f"Updated {relevant_entries.count()} Entry objects for user {affected_user} to use the new default Search model."
                    )

                except Exception as e:
                    logger.error(f"Error embedding documents: {e}")

        logger.info("----")

        # There are also plenty of users who have indexed documents without explicitly creating a UserSearchModelConfig object. You would have to migrate these users as well, if the default is different from search_model_config_id.
        current_default = get_default_search_model()
        if current_default.id != new_default_search_model_config.id:
            users_without_user_search_model_config = KhojUser.objects.annotate(
                user_search_model_config_count=Count("usersearchmodelconfig")
            ).filter(user_search_model_config_count=0)

            logger.info(f"Number of User objects to update: {users_without_user_search_model_config.count()}")
            for user in users_without_user_search_model_config:
                entry_filter = Q(user=user)
                relevant_entries = Entry.objects.filter(entry_filter).all()
                logger.info(f"Number of Entry objects to update for user {user}: {relevant_entries.count()}")

                if apply:
                    try:
                        regenerate_entries(
                            entry_filter,
                            embeddings_model[new_default_search_model_config.name],
                            new_default_search_model_config,
                        )

                        UserSearchModelConfig.objects.create(user=user, setting=new_default_search_model_config)

                        logger.info(
                            f"Created UserSearchModelConfig object for user {user} to use the new default Search model."
                        )
                        logger.info(
                            f"Updated {relevant_entries.count()} Entry objects for user {user} to use the new default Search model."
                        )
                    except Exception as e:
                        logger.error(f"Error embedding documents: {e}")
        else:
            logger.info("Default is the same as search_model_config_id.")

        all_agents = Agent.objects.all()
        logger.info(f"Number of Agent objects to update: {all_agents.count()}")
        for agent in all_agents:
            entry_filter = Q(agent=agent)
            relevant_entries = Entry.objects.filter(entry_filter).all()
            logger.info(f"Number of Entry objects to update for agent {agent}: {relevant_entries.count()}")

            if apply:
                try:
                    regenerate_entries(
                        entry_filter,
                        embeddings_model[new_default_search_model_config.name],
                        new_default_search_model_config,
                    )
                    logger.info(
                        f"Updated {relevant_entries.count()} Entry objects for agent {agent} to use the new default Search model."
                    )
                except Exception as e:
                    logger.error(f"Error embedding documents: {e}")
        if apply and current_default.id != new_default_search_model_config.id:
            # Get the existing default SearchModelConfig object and update its name
            current_default.name = f"prev_default_{current_default.id}"
            current_default.save()

            # Update the new default SearchModelConfig object's name
            new_default_search_model_config.name = "default"
            new_default_search_model_config.save()
        if not apply:
            logger.info("Run the command with the --apply flag to apply the new default Search model.")
