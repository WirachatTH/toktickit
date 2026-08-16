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
| 6 | Next, you must complete Issue 4: Display the IT request category list by following these criteria exactly as it requires. Show me your implementation plan before you begin: [The requirements of issue 4 were pasted here.] | It gave me an error about VITE_API_URL. I had to manually add it to the client/.env file. Apart from that, it worked well. |
| 7 | Next, include the commands to verify all requirements of this issue of this container inside README.md for me and my reviewer to be able to run tests easily. | The result was good. I followed the commands given in README.md and it went well without any errors. | 
## My Reflection
I feel that Gemini 3.1 Pro with a thinking level HIGH was already smart enough to complete everything for me with least errors.

However, there were a few times I had to specifically state that the agent must NOT do anything unmentioned in the criteria (For example, the agent thought ahead and attempted to complete issue 2 when I was still unfinished with issue 1.)

I also realized that paraphrasing my requirements for the agent into bullet points was far more efficient and faster for the agent to understand than simply sending it an entire paragraph worth of message.