# Welcome to the MRD x AI Act Medical Dashbaord 

!!! THIS WORK IN VERY MUCH IN PROGRESS & IN THE EARLY STAGES!!! 



## How can I edit this code?

There are several ways of editing your application.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Set up environment variables
cp .env.example .env
# Edit .env and add your Hugging Face API token

# Step 5: Start the development server with auto-reloading and an instant preview.
npm run dev
```

## Tattoo Detection Feature

This application includes an AI-powered tattoo detection feature that can classify tattoos as real or fake/sticker.

### Setup

1. **Get a Hugging Face API Token**
   - Sign up at [Hugging Face](https://huggingface.co)
   - Go to [Settings > Access Tokens](https://huggingface.co/settings/tokens)
   - Create a new token with read permissions

2. **Configure the Application**
   - Copy `.env.example` to `.env`
   - Add your Hugging Face API token: `REACT_APP_HF_API_TOKEN=your_token_here`
   - Update the model ID in `src/config/huggingface.ts` if using a custom model

3. **Add Example Images** (optional)
   - Add tattoo example images to `public/images/examples/`
   - Recommended: 2 real tattoo examples and 2 fake/sticker examples

### Features

- **Camera Capture**: Take photos directly using device camera
- **Image Upload**: Upload existing images from device
- **Example Images**: Try pre-loaded examples
- **Real-time Classification**: Get instant results on whether a tattoo is real or fake
- **Confidence Scores**: See how confident the AI is in its prediction

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS


