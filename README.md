# codivupload-mcp

MCP server for [CodivUpload](https://codivupload.com) — publish, schedule, and manage social media posts across 9 platforms using AI agents.

Works with Claude Desktop, Claude Code, Cursor, and any MCP-compatible client.

## Setup

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "codivupload": {
      "command": "npx",
      "args": ["-y", "codivupload-mcp"],
      "env": {
        "CODIVUPLOAD_API_KEY": "cdv_live_your_api_key"
      }
    }
  }
}
```

### Claude Code (CLI)

```bash
claude mcp add codivupload \
  --command "npx -y codivupload-mcp" \
  --env CODIVUPLOAD_API_KEY=cdv_live_your_api_key
```

### Cursor

Add to your MCP settings in Cursor → Settings → MCP Servers.

## Get Your API Key

1. Sign up at [app.codivupload.com](https://app.codivupload.com)
2. Go to **Dashboard → Settings → API Keys**
3. Create a new key — it starts with `cdv_live_`

Free plan includes 10 posts/month. Upgrade for unlimited.

## Available Tools

| Tool | Description |
|------|-------------|
| `publish_post` | Publish to 1-9 platforms in one call |
| `schedule_post` | Queue for future delivery (UTC ISO 8601) |
| `get_posts` | List recent posts with status |
| `get_post_status` | Check delivery status for a specific post |
| `list_profiles` | Show connected social profiles |
| `create_profile` | Create a new profile |
| `upload_media` | Upload media to CDN |
| `list_media` | List uploaded media assets |
| `list_broadcasts` | List YouTube live streams |
| `create_broadcast` | Start a 24/7 live stream |

## Supported Platforms

TikTok, Instagram, YouTube, Facebook, LinkedIn, X (Twitter), Threads, Pinterest, Bluesky

## Example

```
You: Schedule my product video to TikTok and Instagram for tomorrow 9am

Claude: I'll schedule that for you.

Using tool: schedule_post
→ Scheduled to TikTok and Instagram for 2026-04-03T14:00:00Z
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CODIVUPLOAD_API_KEY` | Yes | Your CodivUpload API key (`cdv_live_...`) |
| `CODIVUPLOAD_API_BASE_URL` | No | API base URL (default: `https://api.codivupload.com`) |

## Links

- [CodivUpload](https://codivupload.com)
- [API Documentation](https://docs.codivupload.com)
- [API Reference](https://api.codivupload.com)
- [MCP Guide](https://codivupload.com/use-case/mcp-agents)

## License

MIT — Codivion LLC
