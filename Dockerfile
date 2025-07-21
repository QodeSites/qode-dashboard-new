# File: .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches:
      - main

env:
  IMAGE_NAME: my-app          # <-- your Docker image name
  SSH_REMOTE_USER: ${{ secrets.REMOTE_USER }}
  SSH_REMOTE_HOST: ${{ secrets.REMOTE_HOST }}
  SSH_KEY: ${{ secrets.SSH_PRIVATE_KEY }}

jobs:
  build-and-push:
    name: Build & Push Docker Image
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci --legacy-peer-deps

      - name: Build Next.js
        run: npm run build

      - name: Log in to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Build & tag image
        run: docker build -t $IMAGE_NAME:${{ github.sha }} .

      - name: Push image
        run: docker push $IMAGE_NAME:${{ github.sha }}

  deploy:
    name: Deploy to Remote
    needs: build-and-push
    runs-on: ubuntu-latest

    steps:
      - name: Start ssh-agent
        uses: webfactory/ssh-agent@v0.6.0
        with:
          ssh-private-key: ${{ env.SSH_KEY }}

      - name: Deploy via SSH (with keepalive & retries)
        # fail the step if it takes over 20 minutes
        timeout-minutes: 20
        run: |
          for i in {1..3}; do
            ssh -o StrictHostKeyChecking=no \
                -o ServerAliveInterval=60 \
                -o ServerAliveCountMax=5 \
                $SSH_REMOTE_USER@$SSH_REMOTE_HOST \
                "docker pull $IMAGE_NAME:${{ github.sha }} && \
                 docker service update --image $IMAGE_NAME:${{ github.sha }} my-service" \
            && break
            echo "🔁 SSH attempt $i failed — retrying in 10s…" >&2
            sleep 10
          done
