# Lab 1 — AI Use and Reflection  (fill this in)

**LLM/agent used:** <name>

## Selected key prompts (6–10)
| # | Prompt (summarised) | What I did with the result |
|---|---------------------|----------------------------|
| 1 | Setup the TokTickIT project tech stack as given in Lab 1 using React, TypeScript, Vite, and Bootstrap for the frontend, and Node.js, Express, and TypeScript for the backend.Configure PostgreSQL and Prisma. Use the required folder structure. Do not add functionality beyond the Lab 1 scope. | Setup completed without errors. Tests were run ensuring the validity of the project setup. |
| 2 |  I want to run everything in Docker. Setup this project within Docker's container without modifying the currently existing dependencies. | Docker's now running. All services are running without errors and can be accessed at localhost. |
| 3 | Next, you must complete issue-2: Implement the API health check  by following these criteria exactly as it requires [The requirements of issue 2 were pasted here.] | The result was good. But it forgot to also test the endpoint using supertest. I had to give it another prompt about testing the endpoint. |
| 4 | What is the use of CHOKIDAR_USEPOLLING in docker-compose.yml and why is it needed? | I used this prompt to ensure that the agent only added CHOKIDAR_USEPOLLING to the docker-compose.yml file if it was really needed. | 
| 5 | Next, you must complete Issue 3: Create and seed IT request categories by following these criteria exactly as it requires. [The requirements of issue 3 were pasted here.] This is the minimum database model. You may add more models if you see fit and ask me first before you add more, but the follow model is the required one and you must append exactly as shown: [The minimum DB model from the worksheet was pasted here.] | Worked well without issues. However, I had to prompt for more details in README.md on how to verify the correctness inside of this step from inside the Docker terminal without having to manually SSH into the DB container. |
<!-- ## Reflection
Two or three sentences: what made your prompts better, and one place you had to
correct or reject what the agent produced. -->
