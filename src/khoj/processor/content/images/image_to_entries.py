import base64
import logging
import os
from datetime import datetime
from typing import Dict, List, Tuple

from rapidocr_onnxruntime import RapidOCR

from khoj.database.models import Entry as DbEntry
from khoj.database.models import KhojUser
from khoj.processor.content.text_to_entries import TextToEntries
from khoj.utils.helpers import timer
from khoj.utils.rawconfig import Entry

logger = logging.getLogger(__name__)


class ImageToEntries(TextToEntries):
    def __init__(self):
        super().__init__()

    # Define Functions
    def process(
        self, files: dict[str, str] = None, full_corpus: bool = True, user: KhojUser = None, regenerate: bool = False
    ) -> Tuple[int, int]:
        # Extract required fields from config
        if not full_corpus:
            deletion_file_names = set([file for file in files if files[file] == b""])
            files_to_process = set(files) - deletion_file_names
            files = {file: files[file] for file in files_to_process}
        else:
            deletion_file_names = None

        # Extract Entries from specified Pdf files
        with timer("Extract entries from specified PDF files", logger):
            file_to_text_map, current_entries = ImageToEntries.extract_image_entries(files)

        # Split entries by max tokens supported by model
        with timer("Split entries by max token size supported by model", logger):
            current_entries = self.split_entries_by_max_tokens(current_entries, max_tokens=256)

        # Identify, mark and merge any new entries with previous entries
        with timer("Identify new or updated entries", logger):
            num_new_embeddings, num_deleted_embeddings = self.update_embeddings(
                current_entries,
                DbEntry.EntryType.IMAGE,
                DbEntry.EntrySource.COMPUTER,
                "compiled",
                logger,
                deletion_file_names,
                user,
                regenerate=regenerate,
                file_to_text_map=file_to_text_map,
            )

        return num_new_embeddings, num_deleted_embeddings

    @staticmethod
    def extract_image_entries(image_files) -> Tuple[Dict, List[Entry]]:  # important function
        """Extract entries by page from specified image files"""
        file_to_text_map = dict()
        entries: List[str] = []
        entry_to_location_map: List[Tuple[str, str]] = []
        for image_file in image_files:
            try:
                try:
                    loader = RapidOCR()
                    bytes = image_files[image_file]
                    # write the image to a temporary file
                    timestamp_now = datetime.utcnow().timestamp()
                    # use either png or jpg
                    if image_file.endswith(".png"):
                        tmp_file = f"tmp_image_file_{timestamp_now}.png"
                    elif image_file.endswith(".jpg") or image_file.endswith(".jpeg"):
                        tmp_file = f"tmp_image_file_{timestamp_now}.jpg"
                    with open(f"{tmp_file}", "wb") as f:
                        bytes = image_files[image_file]
                        f.write(bytes)
                    try:
                        image_entries_per_file = []
                        result, _ = loader(tmp_file)
                        if result:
                            image_entries_per_file = [text[1] for text in result]
                    except ImportError:
                        logger.warning(f"Unable to process file: {image_file}. This file will not be indexed.")
                        continue
                except ImportError:
                    logger.warning(f"Unable to process file: {image_file}. This file will not be indexed.")
                    continue
                entry_to_location_map += zip(
                    image_entries_per_file, [image_file] * len(image_entries_per_file)
                )  # this is an indexed map of image_entries for the pdf.
                entries.extend(image_entries_per_file)
                file_to_text_map[image_file] = image_entries_per_file
            except Exception as e:
                logger.warning(f"Unable to process file: {image_file}. This file will not be indexed.")
                logger.warning(e, exc_info=True)
            finally:
                if os.path.exists(tmp_file):
                    os.remove(tmp_file)
        return file_to_text_map, ImageToEntries.convert_image_entries_to_maps(entries, dict(entry_to_location_map))

    @staticmethod
    def convert_image_entries_to_maps(parsed_entries: List[str], entry_to_file_map) -> List[Entry]:
        "Convert each image entries into a dictionary"
        entries = []
        for parsed_entry in parsed_entries:
            entry_filename = entry_to_file_map[parsed_entry]
            # Append base filename to compiled entry for context to model
            heading = f"{entry_filename}\n"
            compiled_entry = f"{heading}{parsed_entry}"
            entries.append(
                Entry(
                    compiled=compiled_entry,
                    raw=parsed_entry,
                    heading=heading,
                    file=f"{entry_filename}",
                )
            )

        logger.debug(f"Converted {len(parsed_entries)} image entries to dictionaries")

        return entries
