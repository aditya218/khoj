# syntax=docker/dockerfile:1
FROM ubuntu:jammy
LABEL homepage="https://khoj.dev"
LABEL repository="https://github.com/khoj-ai/khoj"
LABEL org.opencontainers.image.source="https://github.com/khoj-ai/khoj"

# Install System Dependencies
RUN apt update -y && apt -y install python3-pip swig curl

# Install Node.js and Yarn
RUN apt -y install nodejs
RUN npm install -g yarn

# Install RapidOCR dependencies
RUN apt -y install libgl1 libgl1-mesa-glx libglib2.0-0

# Install Application
WORKDIR /app
COPY pyproject.toml .
COPY README.md .
ARG VERSION=0.0.0
RUN sed -i "s/dynamic = \\[\"version\"\\]/version = \"$VERSION\"/" pyproject.toml && \
    pip install --no-cache-dir .

# Copy Source Code
COPY . .

# Set the PYTHONPATH environment variable in order for it to find the Django app.
ENV PYTHONPATH=/app/src:$PYTHONPATH

# Go to the directory src/interface/web and export the built Next.js assets
WORKDIR /app/src/interface/web
RUN bash -c "yarn cache clean && yarn install --verbose && yarn ciexport"
WORKDIR /app

# Run the Application
# There are more arguments required for the application to run,
# but these should be passed in through the docker-compose.yml file.
ARG PORT
EXPOSE ${PORT}
ENTRYPOINT ["python3", "src/khoj/main.py"]
