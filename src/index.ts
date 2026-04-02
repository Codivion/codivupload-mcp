#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "@modelcontextprotocol/sdk/deps.js";

const API_BASE = process.env.CODIVUPLOAD_API_BASE_URL || "https://api.codivupload.com";
const API_KEY = process.env.CODIVUPLOAD_API_KEY;

if (!API_KEY) {
  console.error("Error: CODIVUPLOAD_API_KEY environment variable is required.");
  console.error("Get your API key at https://app.codivupload.com/en/dashboard/settings");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

async function apiCall(method: string, path: string, body?: unknown) {
  const url = `${API_BASE}/v1${path}`;
  const res = await fetch(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json();
  if (!res.ok) {
    return { error: true, status: res.status, ...data };
  }
  return data;
}

// ─── Server ──────────────────────────────────────────────────────────

const server = new McpServer({
  name: "codivupload",
  version: "1.0.0",
});

// ─── Tool: list_profiles ─────────────────────────────────────────────

server.tool(
  "list_profiles",
  "List all social media profiles in your workspace with their connected platform accounts.",
  {},
  async () => {
    const data = await apiCall("GET", "/agency/profiles");
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Tool: create_profile ────────────────────────────────────────────

server.tool(
  "create_profile",
  "Create a new social media profile in your workspace.",
  {
    username: z.string().describe("Unique username for the profile (min 3 chars)"),
    profile_name: z.string().describe("Display name for the profile"),
  },
  async ({ username, profile_name }) => {
    const data = await apiCall("POST", "/agency/profiles", { username, profile_name });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Tool: publish_post ──────────────────────────────────────────────

server.tool(
  "publish_post",
  "Publish content to one or more social media platforms. Supports TikTok, Instagram, YouTube, Facebook, LinkedIn, X, Threads, Pinterest, Bluesky.",
  {
    platforms: z.array(z.string()).describe("Platform slugs: tiktok, instagram, youtube, facebook, linkedin, twitter, threads, pinterest, bluesky"),
    post_type: z.enum(["post", "reel", "story", "short"]).describe("Content type"),
    description: z.string().describe("Post caption / body text"),
    media_urls: z.array(z.string()).optional().describe("CDN URLs for images or video files"),
    profile_name: z.string().optional().describe("Target profile username (for multi-profile workspaces)"),
    // Platform-specific overrides
    tiktok_privacy_level: z.number().optional().describe("TikTok privacy: 0=public, 1=friends, 2=private"),
    tiktok_disable_duet: z.boolean().optional().describe("Disable TikTok duet"),
    tiktok_disable_comment: z.boolean().optional().describe("Disable TikTok comments"),
    tiktok_disable_stitch: z.boolean().optional().describe("Disable TikTok stitch"),
    tiktok_brand_content_toggle: z.boolean().optional().describe("Enable TikTok branded content"),
    instagram_media_type: z.string().optional().describe("REELS, STORIES, or IMAGE"),
    instagram_location_id: z.string().optional().describe("Instagram location ID"),
    youtube_type: z.string().optional().describe("video, short, or live"),
    youtube_privacy: z.string().optional().describe("public, unlisted, or private"),
    youtube_category_id: z.string().optional().describe("YouTube category ID"),
    youtube_tags: z.array(z.string()).optional().describe("YouTube video tags"),
    youtube_title: z.string().optional().describe("YouTube video title"),
    youtube_thumbnail_url: z.string().optional().describe("YouTube thumbnail image URL"),
    facebook_type: z.string().optional().describe("video, image, text, link, reel"),
    linkedin_type: z.string().optional().describe("post or article"),
    pinterest_board_id: z.string().optional().describe("Pinterest board ID"),
    pinterest_link: z.string().optional().describe("Pinterest destination link"),
  },
  async (params) => {
    const data = await apiCall("POST", "/posts", params);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Tool: schedule_post ─────────────────────────────────────────────

server.tool(
  "schedule_post",
  "Schedule content for future publishing. Same parameters as publish_post plus a scheduled date.",
  {
    platforms: z.array(z.string()).describe("Platform slugs"),
    post_type: z.enum(["post", "reel", "story", "short"]).describe("Content type"),
    description: z.string().describe("Post caption / body text"),
    scheduled_date: z.string().describe("UTC ISO 8601 datetime for delivery, e.g. 2026-04-05T14:00:00Z"),
    media_urls: z.array(z.string()).optional().describe("CDN URLs for media files"),
    profile_name: z.string().optional().describe("Target profile username"),
    // All platform-specific overrides
    tiktok_privacy_level: z.number().optional().describe("TikTok privacy: 0=public, 1=friends, 2=private"),
    instagram_media_type: z.string().optional().describe("REELS, STORIES, or IMAGE"),
    youtube_type: z.string().optional().describe("video, short, or live"),
    youtube_privacy: z.string().optional().describe("public, unlisted, or private"),
    youtube_category_id: z.string().optional().describe("YouTube category ID"),
    youtube_tags: z.array(z.string()).optional().describe("YouTube video tags"),
    youtube_title: z.string().optional().describe("YouTube video title"),
  },
  async (params) => {
    const data = await apiCall("POST", "/posts", params);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Tool: get_posts ─────────────────────────────────────────────────

server.tool(
  "get_posts",
  "List recent posts with delivery status and platform breakdown. Filter by status or date.",
  {
    limit: z.number().optional().describe("Number of posts to return (default 20, max 100)"),
    status: z.string().optional().describe("Filter by status: scheduled, publishing, published, failed"),
    profile_name: z.string().optional().describe("Filter by profile username"),
  },
  async ({ limit, status, profile_name }) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (status) params.set("status", status);
    if (profile_name) params.set("profile_name", profile_name);
    const query = params.toString() ? `?${params.toString()}` : "";
    const data = await apiCall("GET", `/posts${query}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Tool: get_post_status ───────────────────────────────────────────

server.tool(
  "get_post_status",
  "Check delivery status for a specific post by its ID.",
  {
    post_id: z.string().describe("The post ID to check status for"),
  },
  async ({ post_id }) => {
    const data = await apiCall("GET", `/posts/${post_id}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Tool: upload_media ──────────────────────────────────────────────

server.tool(
  "upload_media",
  "Upload a media file to CodivUpload CDN. Returns a URL that can be used in publish_post or schedule_post.",
  {
    file_url: z.string().describe("Public URL of the file to upload to CDN"),
    profile_name: z.string().optional().describe("Profile to associate the media with"),
  },
  async ({ file_url, profile_name }) => {
    const data = await apiCall("POST", "/upload-media", {
      media_url: file_url,
      ...(profile_name ? { profile_name } : {}),
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Tool: list_media ────────────────────────────────────────────────

server.tool(
  "list_media",
  "List media assets uploaded to your workspace CDN.",
  {
    limit: z.number().optional().describe("Number of items to return"),
  },
  async ({ limit }) => {
    const params = limit ? `?limit=${limit}` : "";
    const data = await apiCall("GET", `/agency/media${params}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Tool: list_broadcasts ───────────────────────────────────────────

server.tool(
  "list_broadcasts",
  "List active and past YouTube live stream broadcasts.",
  {},
  async () => {
    const data = await apiCall("GET", "/broadcasts");
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Tool: create_broadcast ──────────────────────────────────────────

server.tool(
  "create_broadcast",
  "Start a new 24/7 YouTube live stream broadcast.",
  {
    profile_name: z.string().describe("Profile with YouTube connected"),
    title: z.string().describe("Stream title"),
    media_url: z.string().describe("Video file URL to loop"),
    loop: z.boolean().optional().describe("Loop the video continuously (default true)"),
  },
  async (params) => {
    const data = await apiCall("POST", "/broadcasts", params);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Start ───────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
