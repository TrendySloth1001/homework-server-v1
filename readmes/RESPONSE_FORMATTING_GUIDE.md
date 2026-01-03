# AI Response Formatting Guide

## Overview

The response formatter automatically parses AI-generated text and structures it for frontend consumption. It handles markdown, tables, lists, code blocks, and inline formatting.

## Features

### Supported Formatting

1. **Headings** (`# ## ###`)
2. **Lists** (unordered `-` `*` and ordered `1.`)
3. **Tables** (`| col | col |`)
4. **Code Blocks** (` ``` `)
5. **Blockquotes** (`>`)
6. **Horizontal Rules** (`---`, `***`)
7. **Inline Formatting**:
   - Bold: `**text**` or `__text__`
   - Italic: `*text*` or `_text_`
   - Inline code: `` `code` ``

### JSON-Wrapped Responses

Automatically detects and extracts content from JSON-wrapped AI responses:

```json
{
  "response": "The actual content...",
  "answer": "Alternative field...",
  "content": "Another variant..."
}
```

## API Integration

### Request

```typescript
POST /api/v1/ai/generate
{
  "prompt": "Explain photosynthesis",
  "teacherId": "teacher-123",
  "formatResponse": true  // Enable formatting (default: true)
}
```

### Response Structure

```typescript
{
  "success": true,
  "data": {
    "response": "Raw markdown text...",
    "formatted": {
      "raw": "Original response",
      "formatted": [
        {
          "type": "heading",
          "content": "Photosynthesis",
          "level": 1
        },
        {
          "type": "text",
          "content": "Photosynthesis is the process...",
          "format": ["bold"]
        },
        {
          "type": "list",
          "content": ["Light reaction", "Dark reaction"],
          "ordered": false
        }
      ],
      "hasFormatting": true,
      "metadata": {
        "hasCode": false,
        "hasTables": false,
        "hasLists": true,
        "wordCount": 150
      }
    },
    "conversationId": "conv-456",
    "messageId": "msg-789"
  }
}
```

## Content Block Types

### 1. Text Block

```typescript
{
  "type": "text",
  "content": "Regular paragraph text",
  "format": ["bold", "italic", "code"] // Optional
}
```

### 2. Heading Block

```typescript
{
  "type": "heading",
  "content": "Section Title",
  "level": 2  // 1-6 for h1-h6
}
```

### 3. List Block

```typescript
{
  "type": "list",
  "content": ["Item 1", "Item 2", "Item 3"],
  "ordered": false  // true for numbered lists
}
```

### 4. Table Block

```typescript
{
  "type": "table",
  "content": {
    "headers": ["Name", "Value", "Unit"],
    "rows": [
      ["Temperature", "25", "°C"],
      ["Pressure", "1", "atm"]
    ]
  }
}
```

### 5. Code Block

```typescript
{
  "type": "code",
  "content": "const x = 42;\nconsole.log(x);",
  "language": "javascript"
}
```

### 6. Blockquote Block

```typescript
{
  "type": "blockquote",
  "content": "Quoted text here"
}
```

### 7. Divider Block

```typescript
{
  "type": "divider",
  "content": ""
}
```

## Frontend Rendering Examples

### React Example

```tsx
import { FormattedContent } from '../types';

function renderBlock(block: FormattedContent) {
  switch (block.type) {
    case 'heading':
      const Tag = `h${block.level}` as keyof JSX.IntrinsicElements;
      return <Tag>{block.content}</Tag>;
    
    case 'text':
      return (
        <p className={block.format?.includes('bold') ? 'font-bold' : ''}>
          {block.content}
        </p>
      );
    
    case 'list':
      const ListTag = block.ordered ? 'ol' : 'ul';
      return (
        <ListTag>
          {(block.content as string[]).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ListTag>
      );
    
    case 'table':
      const { headers, rows } = block.content as { headers: string[]; rows: string[][] };
      return (
        <table>
          <thead>
            <tr>
              {headers.map((h, i) => <th key={i}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => <td key={j}>{cell}</td>)}
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
    
    default:
      return null;
  }
}

function AIResponse({ formatted }: { formatted: FormattedResponse }) {
  return (
    <div className="ai-response">
      {formatted.formatted.map((block, i) => (
        <div key={i}>{renderBlock(block)}</div>
      ))}
    </div>
  );
}
```

### HTML Conversion

The formatter includes built-in HTML conversion:

```typescript
import { responseFormatter } from '../lib/responseFormatter';

const formatted = responseFormatter.formatResponse(aiResponse);
const html = responseFormatter.toHTML(formatted);
// Returns: <h1>Title</h1><p>Text...</p><ul><li>Item</li></ul>
```

## Configuration

### Disable Formatting

```typescript
POST /api/v1/ai/generate
{
  "prompt": "Your prompt",
  "formatResponse": false  // Return only raw text
}
```

### Extract Plain Text

```typescript
import { responseFormatter } from '../lib/responseFormatter';

const formatted = responseFormatter.formatResponse(aiResponse);
const plainText = responseFormatter.extractPlainText(formatted);
```

## Examples

### Example 1: Educational Content

**AI Output:**
```
# Photosynthesis

Photosynthesis is the process by which plants convert **light energy** into chemical energy.

## Key Components:
- Chlorophyll
- Sunlight
- Water
- Carbon dioxide

The equation:
```
6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂
```
```

**Formatted Output:**
```json
{
  "formatted": [
    { "type": "heading", "content": "Photosynthesis", "level": 1 },
    { "type": "text", "content": "Photosynthesis is the process by which plants convert **light energy** into chemical energy.", "format": ["bold"] },
    { "type": "heading", "content": "Key Components:", "level": 2 },
    { "type": "list", "content": ["Chlorophyll", "Sunlight", "Water", "Carbon dioxide"], "ordered": false },
    { "type": "text", "content": "The equation:" },
    { "type": "code", "content": "6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂", "language": "text" }
  ],
  "hasFormatting": true,
  "metadata": {
    "hasCode": true,
    "hasTables": false,
    "hasLists": true,
    "wordCount": 35
  }
}
```

### Example 2: Table Data

**AI Output:**
```
Here's a comparison:

| Element | Symbol | Atomic Number |
|---------|--------|---------------|
| Hydrogen | H | 1 |
| Oxygen | O | 8 |
| Carbon | C | 6 |
```

**Formatted Output:**
```json
{
  "formatted": [
    { "type": "text", "content": "Here's a comparison:" },
    {
      "type": "table",
      "content": {
        "headers": ["Element", "Symbol", "Atomic Number"],
        "rows": [
          ["Hydrogen", "H", "1"],
          ["Oxygen", "O", "8"],
          ["Carbon", "C", "6"]
        ]
      }
    }
  ],
  "metadata": {
    "hasTables": true
  }
}
```

## Best Practices

### 1. Frontend Rendering
- Always check `block.type` before rendering
- Handle missing content gracefully
- Use `formatted.hasFormatting` to show raw text fallback
- Cache rendered components for performance

### 2. Styling
- Add CSS classes based on `block.format` array
- Use `metadata` fields for conditional UI (e.g., show "Contains Code" badge)
- Implement syntax highlighting for code blocks using `block.language`

### 3. Error Handling
```typescript
try {
  const formatted = response.formatted || 
    responseFormatter.formatResponse(response.response);
  
  if (!formatted.hasFormatting) {
    // Fallback to simple text display
    return <p>{response.response}</p>;
  }
  
  return <FormattedResponse data={formatted} />;
} catch (error) {
  // Always show raw text on formatting errors
  return <pre>{response.response}</pre>;
}
```

### 4. Accessibility
- Use semantic HTML tags
- Add `aria-label` for complex elements
- Ensure tables have proper headers
- Add `role` attributes for custom components

## Performance Considerations

- **Caching**: Formatted responses are cached in conversation messages
- **Lazy Loading**: Render only visible blocks for long responses
- **Memoization**: Memoize block rendering components
- **SSR**: Format on server, send structured data to client

## Migration from Raw Responses

If your frontend currently displays raw text:

```typescript
// Old approach
<div>{response.response}</div>

// New approach (backward compatible)
<div>
  {response.formatted ? (
    <FormattedResponse data={response.formatted} />
  ) : (
    response.response
  )}
</div>
```

## Testing

The formatter handles edge cases:
- Empty content
- Malformed markdown
- Mixed formatting styles
- JSON-wrapped responses
- Escaped special characters

## Additional Features

### Word Count
```typescript
const { metadata } = formatted;
console.log(`Response has ${metadata.wordCount} words`);
```

### Content Detection
```typescript
if (formatted.metadata.hasCode) {
  // Show code copy button
}
if (formatted.metadata.hasTables) {
  // Enable table export
}
```

### Plain Text Extraction
```typescript
const plainText = responseFormatter.extractPlainText(formatted);
// Use for search indexing, notifications, etc.
```

## Support

For issues or questions:
- Check `formatted.raw` for original AI output
- Validate `hasFormatting` flag before parsing
- Test with `formatResponse: false` to isolate formatting issues
