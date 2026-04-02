#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Config ──────────────────────────────────────────────────────────

const API_BASE =
  process.env.CODIVUPLOAD_API_BASE_URL || "https://api.codivupload.com";
const API_KEY = process.env.CODIVUPLOAD_API_KEY;
const SPEC_URL =
  process.env.CODIVUPLOAD_OPENAPI_URL || `${API_BASE}/public-openapi.json`;

if (!API_KEY) {
  console.error(
    "Error: CODIVUPLOAD_API_KEY environment variable is required."
  );
  console.error(
    "Get your API key at https://app.codivupload.com/en/dashboard/settings"
  );
  process.exit(1);
}

const headers: Record<string, string> = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

// ─── OpenAPI types (minimal) ─────────────────────────────────────────

interface OpenAPIParam {
  name: string;
  in: string;
  required?: boolean;
  schema?: { type?: string; enum?: string[]; items?: { type?: string }; description?: string };
  description?: string;
}

interface OpenAPIRequestBody {
  content?: {
    "application/json"?: {
      schema?: {
        type?: string;
        properties?: Record<string, OpenAPIProp>;
        required?: string[];
      };
    };
  };
}

interface OpenAPIProp {
  type?: string;
  description?: string;
  enum?: string[];
  items?: { type?: string };
  default?: unknown;
}

interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenAPIParam[];
  requestBody?: OpenAPIRequestBody;
}

interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string };
  servers?: { url: string }[];
  paths: Record<string, Record<string, OpenAPIOperation>>;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function toToolName(method: string, path: string, op: OpenAPIOperation): string {
  if (op.operationId) {
    return op.operationId.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
  }
  // Fallback: method + path → e.g. "post_v1_posts"
  const cleaned = path
    .replace(/^\//, "")
    .replace(/[{}]/g, "")
    .replace(/\//g, "_");
  return `${method}_${cleaned}`.toLowerCase();
}

function openApiPropToZod(prop: OpenAPIProp, required: boolean): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  if (prop.enum && prop.enum.length > 0) {
    schema = z.enum(prop.enum as [string, ...string[]]);
  } else {
    switch (prop.type) {
      case "integer":
      case "number":
        schema = z.number();
        break;
      case "boolean":
        schema = z.boolean();
        break;
      case "array":
        schema = z.array(
          prop.items?.type === "number" || prop.items?.type === "integer"
            ? z.number()
            : z.string()
        );
        break;
      default:
        schema = z.string();
    }
  }

  if (prop.description) {
    schema = schema.describe(prop.description);
  }

  if (!required) {
    schema = schema.optional();
  }

  return schema;
}

function buildZodShape(
  properties: Record<string, OpenAPIProp> | undefined,
  requiredFields: string[] | undefined
): Record<string, z.ZodTypeAny> {
  if (!properties) return {};

  const shape: Record<string, z.ZodTypeAny> = {};
  const reqSet = new Set(requiredFields || []);

  for (const [name, prop] of Object.entries(properties)) {
    shape[name] = openApiPropToZod(prop, reqSet.has(name));
  }

  return shape;
}

async function apiCall(
  method: string,
  path: string,
  params?: Record<string, unknown>
) {
  // Separate path params, query params, and body
  let resolvedPath = path;
  const queryParams = new URLSearchParams();
  let body: Record<string, unknown> | undefined;

  if (params) {
    // Replace path parameters like {id}
    for (const [key, value] of Object.entries(params)) {
      if (resolvedPath.includes(`{${key}}`)) {
        resolvedPath = resolvedPath.replace(`{${key}}`, String(value));
        delete params[key];
      }
    }

    if (method === "GET" || method === "DELETE") {
      // Remaining params go to query string
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          queryParams.set(key, String(value));
        }
      }
    } else {
      // POST/PUT/PATCH → body
      body = params;
    }
  }

  const query = queryParams.toString() ? `?${queryParams.toString()}` : "";
  const url = `${API_BASE}/v1${resolvedPath}${query}`;

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

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  // 1. Fetch OpenAPI spec
  let spec: OpenAPISpec;
  try {
    const res = await fetch(SPEC_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    spec = (await res.json()) as OpenAPISpec;
  } catch (err) {
    console.error(`Failed to fetch OpenAPI spec from ${SPEC_URL}:`, err);
    process.exit(1);
  }

  const toolCount = { registered: 0, skipped: 0 };

  // 2. Create MCP server
  const server = new McpServer({
    name: "codivupload",
    version: spec.info?.version || "1.0.0",
  });

  // 3. Register each endpoint as a tool
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!operation || typeof operation !== "object" || !operation.summary) {
        toolCount.skipped++;
        continue;
      }

      const httpMethod = method.toUpperCase();
      if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(httpMethod)) {
        continue;
      }

      const toolName = toToolName(method, path, operation);
      const description = operation.summary || `${httpMethod} ${path}`;

      // Build parameter schema from:
      // 1. Path/query parameters
      // 2. Request body properties
      const shape: Record<string, z.ZodTypeAny> = {};

      // Path/query params
      if (operation.parameters) {
        for (const param of operation.parameters) {
          const isRequired = param.required || param.in === "path";
          const prop: OpenAPIProp = {
            type: param.schema?.type,
            description: param.description || param.schema?.description,
            enum: param.schema?.enum,
            items: param.schema?.items,
          };
          shape[param.name] = openApiPropToZod(prop, isRequired);
        }
      }

      // Request body
      const bodySchema =
        operation.requestBody?.content?.["application/json"]?.schema;
      if (bodySchema?.properties) {
        const bodyShape = buildZodShape(
          bodySchema.properties,
          bodySchema.required
        );
        Object.assign(shape, bodyShape);
      }

      // Register tool
      try {
        server.tool(
          toolName,
          description,
          shape,
          async (params: Record<string, unknown>) => {
            const data = await apiCall(httpMethod, path, { ...params });
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(data, null, 2) },
              ],
            };
          }
        );
        toolCount.registered++;
      } catch {
        toolCount.skipped++;
      }
    }
  }

  if (toolCount.registered === 0) {
    console.error("No tools registered from OpenAPI spec. Check the spec URL.");
    process.exit(1);
  }

  // 4. Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
