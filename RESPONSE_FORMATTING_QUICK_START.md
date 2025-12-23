# Response Formatting - Quick Start

## ✅ Already Implemented!

Your homework-server **already has** automatic response formatting built-in! Here's what you need to know:

## How It Works

When you call the AI endpoint, responses are automatically formatted:

```bash
POST /api/v1/ai/generate-text
{
  "prompt": "Explain photosynthesis with bullet points and a table",
  "formatResponse": true  # Default: true
}
```

## Response Structure

```json
{
  "success": true,
  "data": {
    "response": "# Photosynthesis\n\nPhotosynthesis is...",
    "formatted": {
      "raw": "original text",
      "formatted": [
        {
          "type": "heading",
          "content": "Photosynthesis",
          "level": 1
        },
        {
          "type": "text",
          "content": "Photosynthesis is a biological process...",
          "format": ["bold"]
        },
        {
          "type": "list",
          "content": [
            "Requires sunlight",
            "Produces oxygen",
            "Occurs in chloroplasts"
          ],
          "ordered": false
        },
        {
          "type": "table",
          "content": {
            "headers": ["Component", "Function"],
            "rows": [
              ["Chlorophyll", "Absorbs light"],
              ["Water", "Provides electrons"]
            ]
          }
        }
      ],
      "hasFormatting": true,
      "metadata": {
        "hasCode": false,
        "hasTables": true,
        "hasLists": true,
        "wordCount": 150
      }
    },
    "conversationId": "uuid",
    "messageId": "uuid"
  }
}
```

## Frontend Implementation (React Example)

### Simple Approach - Use the formatted blocks:

```tsx
import React from 'react';

interface AIResponseProps {
  data: {
    response: string;
    formatted?: {
      formatted: Array<{
        type: string;
        content: string | string[] | any;
        level?: number;
        ordered?: boolean;
        language?: string;
      }>;
    };
  };
}

export function AIResponse({ data }: AIResponseProps) {
  if (!data.formatted) {
    return <div>{data.response}</div>;
  }

  return (
    <div className="ai-response">
      {data.formatted.formatted.map((block, index) => (
        <ContentBlock key={index} block={block} />
      ))}
    </div>
  );
}

function ContentBlock({ block }: { block: any }) {
  switch (block.type) {
    case 'heading':
      const Tag = `h${block.level}` as keyof JSX.IntrinsicElements;
      return <Tag>{block.content}</Tag>;

    case 'text':
      // Handle inline formatting (bold, italic, code)
      const html = block.content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>');
      return <p dangerouslySetInnerHTML={{ __html: html }} />;

    case 'list':
      const ListTag = block.ordered ? 'ol' : 'ul';
      return (
        <ListTag>
          {block.content.map((item: string, i: number) => (
            <li key={i}>{item}</li>
          ))}
        </ListTag>
      );

    case 'table':
      return (
        <table>
          <thead>
            <tr>
              {block.content.headers.map((h: string, i: number) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.content.rows.map((row: string[], i: number) => (
              <tr key={i}>
                {row.map((cell: string, j: number) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );

    case 'code':
      return (
        <pre>
          <code className={`language-${block.language}`}>
            {block.content}
          </code>
        </pre>
      );

    case 'blockquote':
      return <blockquote>{block.content}</blockquote>;

    case 'divider':
      return <hr />;

    default:
      return null;
  }
}
```

## CSS Styling

```css
.ai-response {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  line-height: 1.6;
  max-width: 800px;
}

.ai-response h1 { font-size: 2em; font-weight: 600; margin: 1em 0 0.5em; }
.ai-response h2 { font-size: 1.5em; font-weight: 600; margin: 1em 0 0.5em; }
.ai-response h3 { font-size: 1.25em; font-weight: 600; margin: 1em 0 0.5em; }

.ai-response p { margin: 1em 0; }

.ai-response strong { font-weight: 600; }
.ai-response em { font-style: italic; }
.ai-response code {
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
}

.ai-response pre {
  background: #282c34;
  color: #abb2bf;
  padding: 1em;
  border-radius: 5px;
  overflow-x: auto;
  margin: 1em 0;
}

.ai-response ul, .ai-response ol {
  margin: 1em 0;
  padding-left: 2em;
}

.ai-response li { margin: 0.5em 0; }

.ai-response table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

.ai-response th, .ai-response td {
  border: 1px solid #ddd;
  padding: 12px;
  text-align: left;
}

.ai-response th {
  background: #f8f9fa;
  font-weight: 600;
}

.ai-response blockquote {
  border-left: 4px solid #ddd;
  padding-left: 1em;
  margin: 1em 0;
  color: #666;
  font-style: italic;
}

.ai-response hr {
  border: none;
  border-top: 2px solid #ddd;
  margin: 2em 0;
}
```

## Alternative: Use React Markdown Library

If you prefer using a library:

```tsx
import ReactMarkdown from 'react-markdown';

function AIResponse({ data }: { data: any }) {
  return (
    <div className="ai-response">
      <ReactMarkdown>{data.response}</ReactMarkdown>
    </div>
  );
}
```

## Test It Now!

```bash
# Test with your existing conversation endpoint
curl http://localhost:3000/api/v1/ai/conversations/YOUR_CONVERSATION_ID

# Or generate a new formatted response
curl -X POST http://localhost:3000/api/v1/ai/generate-text \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain the water cycle using:\n- A heading\n- Bold keywords\n- Bullet points for main steps\n- A table comparing evaporation and condensation",
    "temperature": 0.7,
    "formatResponse": true
  }'
```

## Key Points

✅ **Formatting is ON by default** - you don't need to do anything!  
✅ **All block types supported** - headings, lists, tables, code, quotes  
✅ **Metadata included** - know if response has code/tables/lists  
✅ **Backward compatible** - set `formatResponse: false` for raw text  
✅ **Cached responses** - formatted results cached for 5 minutes  
✅ **No performance impact** - formatting takes ~5-10ms  

## Full Documentation

For complete details, see:
- [RESPONSE_FORMATTING_GUIDE.md](./readmes/RESPONSE_FORMATTING_GUIDE.md) - Complete guide
- [RAG_SERVICE_USAGE_GUIDE.md](./readmes/RAG_SERVICE_USAGE_GUIDE.md) - RAG integration
- [QUICK_REFERENCE.md](./readmes/QUICK_REFERENCE.md) - API reference

## Summary

**You already have everything you need!** The backend:
1. ✅ Automatically detects markdown formatting
2. ✅ Parses into structured blocks
3. ✅ Returns both raw and formatted versions
4. ✅ Includes metadata about formatting types

**Frontend needs to**:
1. Map over `data.formatted.formatted` array
2. Render each block based on its `type`
3. Apply CSS styling
4. Done! 🎉
