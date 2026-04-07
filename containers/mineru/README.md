# MinerU Container

This container runs the MinerU API service used by the asynchronous PDF OCR path.

Current assumptions:
- CPU-oriented deployment on Cloudflare Containers
- API process listens on port `8000`
- Worker-side proxy targets `/file_parse`

The main Worker keeps `unpdf` in-process for fast/simple PDFs and only sends heavy OCR/layout jobs to this container.

Notes:
- The Dockerfile currently installs `mineru[all]` and starts `mineru-api`.
- If MinerU's packaging or startup contract changes, update the Dockerfile and the `MinerUContainer` class together.
- Artifact retention is handled in the Worker path via R2 metadata and should also be paired with an R2 lifecycle rule in Cloudflare.
