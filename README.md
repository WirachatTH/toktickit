# TokTickIT 

## Setup Instructions (Dockerized)

This project has been set up to run entirely via Docker Compose.

### Prerequisites
- Docker and Docker Compose installed on your system.

### Running the Application
1. Ensure your Docker daemon is running.
2. In the root directory, start the application by running:
   ```bash
   docker-compose up -d --build
   ```
3. This will spin up three containers:
   - **db**: PostgreSQL database (exposed on port 5432)
   - **server**: Node.js Express backend (exposed on port 3000)
   - **client**: React + Vite frontend (exposed on port 5173)

4. Once running, you can access the frontend at [http://localhost:5173](http://localhost:5173).

### Stopping the Application
To stop the application, run:
```bash
docker-compose down
```

### Running Tests
To run the automated tests inside the containers:

**Client Tests:**
```bash
docker-compose exec client npm test
```

**Server Tests:**
```bash
docker-compose exec server npm test
```

### Performing API Health Check

You can verify the backend API health in two ways:

1. **Via Browser:** 
   Navigate to [http://localhost:3000/api/health](http://localhost:3000/api/health). You should see a JSON response: `{"status":"ok","service":"TokTickIT API"}`.

2. **Via Supertest:**
   Run the backend test suite which includes a Supertest verification of the health endpoint:
   ```bash
   docker-compose exec server npm test
   ```