# Introduction

This guide will help you set started developing in GHOST.

# Organization (developer notes, delete later)

TODO: have an ARCHITECTURE file for the details on architecture
That will also include a diagram of the whole thing hopefully

- starter guide
- tech stack
- getting started
- external documentation
- coding standards
- Project setup
-   Recommended VSCode plugins
-   Recommended vscode/settings.json configuration
- Project structure
- Best practices
- Important systems

## TLDR starter guide

1. Clone the repo
2. Get the `.env` file from another contributor and place at root directory
3. Install dependencies
4. Install these VSCode plugins
   - Vue - Official
   - Tailwind CSS IntelliSense
   - ESLint
5. Check out the "Recommended vscode/settings.json configuration" section for a better developer experience
6. Read over "Coding Standards" sections
7. To figure out what is going on, refer to the external documentation linked below, as well as the "Project Structure" section to see the purpose of specific directories and files within the repo.

## Tech stack

- **Nuxt 4** - a full-stack web framework built on top of Vue
- **NuxtUI** - for prebuilt UI components
- **Nuxt OIDC Auth** - for Entra authentication
- **AWS SDK for JavaScript** - for API calls to AWS (similar to boto3)
- **TailwindCSS** - for custom styling
- **Pinia store** - for managing state across multiple Vue files
- **Chart.js** - for charts

## Getting started

Install dependencies:
`npm install`

Start the development server on `http://localhost:3000`:
`npm run dev`

To run GHOST on your local machine, you will need a specific `.env` file at the root directory. It is gitignored, so you will have to get it from someone who has done development work on GHOST. The `.env` file simulates the environment variables that exist on the ECS container that GHOST is deployed on. The Terraform for passing the environment variables into the container can be found at `./terraform/ecs.tf`.

## External documentation

Nuxt (Go here first): https://nuxt.com/docs/getting-started/introduction

NuxtUI: https://ui.nuxt.com/getting-started

AWS SDK for JavaScript: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/introduction/

TypeScript: https://www.typescriptlang.org/docs/

Vue (For details on Vue concepts that Nuxt uses): https://vuejs.org/guide/introduction.html

## Coding standards

Please use TypeScript for both frontend and backend code. You can use the `/shared/types` directory to create files that define/export types that will be shared by your frontend and backend code. These types will be automatically imported.

Avoid unnecessarily long Vue files. Breaking code down into logical components makes the code much easier to understand and work with. If a .vue file exceeds 500-600 lines, it may be an indication that it can be refactored into smaller components. A chunk of code does _not_ have to be used in multiple places in order for it to be put into its own component; code organization and readability are good enough reasons in of themselves.

Try to use NuxtUI components over custom components whenever possible. If the NuxtUI component you are trying to use isn't quite right, take a look at the config section for that component in the NuxtUI documentation. You can modify this either per individual component (e.g. `<UTooltip :ui="{ width: 'max-w-lg'; }"`), or change it in `app.config.ts` to set it globally.

## Recommended VSCode plugins

- Vue - Official
- Tailwind CSS IntelliSense
- ESLint

## Recommended vscode/settings.json configuration

Press ctrl+shift+p to open your `settings.json` in VSCode. Here are some settings you might find helpful:

```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit" // This will apply any automatic ESLint fixes to your code whenever you save.
  },
  "tailwindCSS.includeLanguages": {
    // Enhance tailwind intellisense
    "html": "html",
    "javascript": "javascript",
    "typescript": "typescript",
    "css": "css"
  },
  "editor.quickSuggestions": {
    // Enhance tailwind intellisense
    "strings": "on"
  },
  "[terraform]": {
    "editor.tabSize": 2
  },
  "[javascript]": {
    "editor.tabSize": 2
  },
  "[typescript]": {
    "editor.tabSize": 2
  },
  "[vue]": {
    "editor.tabSize": 2
  }
}
```

## Project Structure (TODO: review)

#### Important directories

- **/terraform** - This is where all the Terraform for the deployment is stored. It includes TF for the ECR repo, ECS cluster/service/task, SM secret, load balancer, IAM/networking, etc. Most of these resources have a dev and prod version; there is a separate TF state file for each environment.
- **/app/components** - Contains reusable Vue components that are used throughout the application.
- **/app/pages** - Defines the application's page structure. Each .vue file in this directory automatically becomes a route. Dynamic routes (e.g., [id].vue) allow for parameterized URLs.
- **/app/middleware** - Create middleware to run code before navigating to a particular route (or any route, if you make it global). Note that there is also server middleware at `/server/middleware` which runs on every API request.
- **/server** - Contains backend logic, including API routes. This is where all server-side processing happens.
- **/app/composables** - Composables are functions that use Vue's Composition API (`ref`, `reactive`, `computed`, `watch`, etc.) to encapsulate and reuse logic.
- **/app/plugins** - Plugins are a way to extend the functionality of the application. Usually used to integrate third-party libraries or add global functionality that should be avaliable throughout the application (Ex. a global error handler).
- **/app/stores** - Stores are used to manage state accross multiple components / pages.
- **/shared/utils** - Contains utility functions or helper methods tha can be reused throughout the application. These are generally small and do not depend on the app's state.
- **/shared/types** - Contains TypeScript types that are used by multiple files.

#### Important files

- **.gitlab-ci.yml** - This pipeline builds and pushes the Docker image for the application to ECR. It also applies the Terraform.
- **Dockerfile** - The Dockerfile contains instructions for building the Docker image.
- **nuxt.config.ts** - This config file is for configuring various settings for your application. This includes modules (like NuxtUI), UI configuration, CORS, and Entra authentication.
- **app.config.ts** - We mainly use this for globally modifying the configuration of NuxtUI components. For example, you might want to change the maximum width of UTooltip without changing that config in every individual UTooltip component. See here for more detail: https://ui2.nuxt.com/getting-started/theming#components
- **package.json** - Contains metadata about the Nuxt project including project name, scripts, and a list of dependencies (both dependencies and devDependencies). The list of dependencies gets automatically updated when you run `npm install <some-package>` or `npm install --save-dev <some-package>`. Because these updates are handled by npm, you typically don't need to manually edit this file.
- **package-lock.json** - This file locks your dependencies to exact version numbers which ensures consistent installations across different environments. It records the full dependency tree with resolved versions which allows other developers (or a CICD pipeline) to run the project with identical dependencies. You should never edit this file manually since it is automatically updated when your dependencies change.
- **/middleware/authorize.global.ts** - This middleware runs every time the user navigates to a new route. It checks if the user is allowed to access the route they are trying to navigate to.

#### Modules

- **NuxtUI** - NuxtUI is a UI library that provides pre-built UI components built with Tailwind CSS.
- **Pinia** - A state management library for Vue/Nuxt.
- **ESLint** - ESLint is a linter that detects issues with your code. You can adjust your `vscode/settings.json` to have it automatically resolve issues when possible.
- **Nuxt OIDC Auth** - An auth library we are using for Entra authentication in GHOST.

#### Other

- **Tailwind CSS** - Tailwind is a CSS library that makes it simpler and faster to stylize web pages.

## How does authentication work?

WIP (put in some diagrams here!)

## Error handling

TODO: remove

For critial issues (e.g. being unable to fetch the user's groups) use the `triggerCriticalError` utility, which will redirect the user to an error page and print an error in the developer console.

## Common issues

#### Why am I getting "Cannot find name ..." when my composable/util is supposed to be auto imported?
1. Make sure your composable is directly in the `/app/composable/` directory (sub folders are not scanned)
2. Run `npm run dev` again to regenerate the `.nuxt/imports.d.ts` directory
