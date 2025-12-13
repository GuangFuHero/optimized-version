# Discord Webhook Setup Guide

This guide will help you set up Discord webhooks to receive notifications for Pull Requests and repository events.

## Step 1: Create a Discord Webhook

1. **Open Discord** and navigate to your server
2. Go to the **PR channel** (or any channel where you want notifications)
3. Click on the **channel name** at the top → **Edit Channel**
4. Go to **Integrations** → **Webhooks**
5. Click **Create Webhook** or **New Webhook**
6. Configure your webhook:
   - **Name**: Give it a name like "GitHub Notifications" or "Repo Alerts"
   - **Channel**: Make sure it's set to your PR channel
   - **Copy the Webhook URL** - This is important! It looks like:
     ```
     https://discord.com/api/webhooks/1234567890123456789/abcdefghijklmnopqrstuvwxyz1234567890
     ```
7. Click **Save Changes**

## Step 2: Add Webhook URL to GitHub Secrets

1. Go to your GitHub repository: `https://github.com/GuangFuHero/optimized-version`
2. Click on **Settings** (top right of the repository)
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Fill in:
   - **Name**: `DISCORD_WEBHOOK_URL`
   - **Secret**: Paste your Discord webhook URL from Step 1
6. Click **Add secret**

## Step 3: Test the Webhook

You can test your webhook by:

1. **Creating a test PR** - Open a pull request and you should see a notification in Discord
2. **Pushing to main/develop** - Push a commit and you should see a notification
3. **Creating an issue** - Open an issue and you should see a notification

## What Notifications You'll Receive

### Pull Request Notifications
- When a PR is opened
- When a PR is edited
- When new commits are pushed to a PR
- When a PR is closed
- When a PR is reopened
- When a PR is marked as ready for review
- When someone reviews a PR

### Repository Notifications
- When code is pushed to `main` or `develop` branches
- When issues are opened, closed, or reopened
- When someone comments on an issue
- When branches or tags are created
- When branches or tags are deleted

## Notification Format

Your Discord notifications will look like this:

### Pull Request Example:
```
📋 Pull Request: Add new feature to backend

PR #42 by @john_doe
Action: opened
State: open
Branch: feature/new-backend → main
URL: [Click here to view]
```

### Repository Event Example:
```
📢 New commits pushed to main

Branch: main
Commits: 3
Author: john_doe
Message: Fix bug in authentication
URL: [Click here to view]
```

## Troubleshooting

### Not receiving notifications?

1. **Check the webhook URL** - Make sure it's correctly added to GitHub Secrets
2. **Check the channel** - Verify the webhook is pointing to the correct Discord channel
3. **Check GitHub Actions** - Go to the Actions tab and see if workflows are running
4. **Check webhook status** - In Discord, go back to Integrations → Webhooks and verify it's active

### Webhook stopped working?

1. **Regenerate the webhook** - Delete the old one and create a new webhook URL
2. **Update the secret** - Update `DISCORD_WEBHOOK_URL` in GitHub Secrets with the new URL

## Security Notes

⚠️ **Important**: Never share your webhook URL publicly or commit it to your repository. Always use GitHub Secrets to store it securely.

## Need Help?

If you encounter any issues:
1. Check the GitHub Actions logs for error messages
2. Verify the webhook URL is correct
3. Make sure the Discord channel permissions allow webhooks to post

