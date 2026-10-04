import path from 'node:path';
import fs from 'node:fs/promises';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { analyzeImage, generateImage, extractText, extractImages, configSummary, fileToDataUri } from './agnes-api.mjs';

const server = new Server({ name: 'agnes-image-mcp', version: '2.1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [
  {
    name: 'agnes-image_analyze_image',
    description: 'Analyze a local reference image with Agnes Vision and return structured visual analysis text.',
    inputSchema: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Local PNG/JPG/JPEG/WebP path.' },
        prompt: { type: 'string', description: 'Vision analysis instruction.' },
        model: { type: 'string', description: 'Optional Agnes vision model.' }
      },
      required: ['image_path']
    }
  },
  {
    name: 'agnes-image_generate_image',
    description: 'Generate an e-commerce image with Agnes Image. Optional local reference images are converted to Data URI automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' }, size: { type: 'string' }, ratio: { type: 'string' },
        reference_images: { type: 'array', items: { type: 'string' } },
        model: { type: 'string' }, output_path: { type: 'string' }
      }, required: ['prompt']
    }
  },
  {
    name: 'agnes-image_edit_image',
    description: 'Edit a product reference image with Agnes Image-to-Image.',
    inputSchema: {
      type: 'object', properties: {
        prompt: { type: 'string' }, image_path: { type: 'string' }, size: { type: 'string' }, ratio: { type: 'string' }, model: { type: 'string' }, output_path: { type: 'string' }
      }, required: ['prompt', 'image_path']
    }
  },
  {
    name: 'agnes-image_compose_images',
    description: 'Compose multiple local reference images into one generated image.',
    inputSchema: {
      type: 'object', properties: {
        prompt: { type: 'string' }, image_paths: { type: 'array', items: { type: 'string' } }, size: { type: 'string' }, ratio: { type: 'string' }, model: { type: 'string' }, output_path: { type: 'string' }
      }, required: ['prompt', 'image_paths']
    }
  },
  {
    name: 'agnes-image_agnes_status',
    description: 'Show Agnes MCP configuration without exposing the API key.',
    inputSchema: { type: 'object', properties: {} }
  }
] }));

async function saveResult(result, outputPath) {
  const item = extractImages(result.response)[0];
  if (!item) return { result };
  if (outputPath && item.b64_json) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, Buffer.from(item.b64_json, 'base64'));
    return { output_path: outputPath, model: result.model, response: { ...item, b64_json: '[saved to file]' } };
  }
  return { model: result.model, result: item };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = request.params.arguments || {};
  try {
    if (name === 'agnes-image_agnes_status') return { content: [{ type: 'text', text: JSON.stringify(configSummary(), null, 2) }] };
    if (name === 'agnes-image_analyze_image') {
      const prompt = args.prompt || `Analyze this product reference image for an e-commerce image workflow. Return Markdown with: product identity, variant, visible text, shape/proportions, colors, texture, composition, lighting, background, props, brand/package elements, preservation requirements, and uncertainties. Do not invent details.`;
      const result = await analyzeImage(args.image_path, prompt, args.model);
      return { content: [{ type: 'text', text: `Model: ${result.model}\n\n${extractText(result.response)}` }] };
    }
    if (name === 'agnes-image_generate_image') {
      const images = [];
      for (const p of (args.reference_images || [])) images.push(await fileToDataUri(p));
      const result = await generateImage({ prompt: args.prompt, size: args.size || '2K', ratio: args.ratio || '9:16', images, model: args.model, responseFormat: args.output_path ? 'b64_json' : 'url' });
      return { content: [{ type: 'text', text: JSON.stringify(await saveResult(result, args.output_path), null, 2) }] };
    }
    if (name === 'agnes-image_edit_image') {
      const images = [await fileToDataUri(args.image_path)];
      const result = await generateImage({ prompt: args.prompt, size: args.size || '2K', ratio: args.ratio || '9:16', images, model: args.model, responseFormat: args.output_path ? 'b64_json' : 'url' });
      return { content: [{ type: 'text', text: JSON.stringify(await saveResult(result, args.output_path), null, 2) }] };
    }
    if (name === 'agnes-image_compose_images') {
      const images = [];
      for (const p of args.image_paths || []) images.push(await fileToDataUri(p));
      const result = await generateImage({ prompt: args.prompt, size: args.size || '2K', ratio: args.ratio || '9:16', images, model: args.model, responseFormat: args.output_path ? 'b64_json' : 'url' });
      return { content: [{ type: 'text', text: JSON.stringify(await saveResult(result, args.output_path), null, 2) }] };
    }
    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err?.stack || String(err) }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
