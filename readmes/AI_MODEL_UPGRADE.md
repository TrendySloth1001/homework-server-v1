# AI Model Upgrade - Fix [object Object] Issue

**Date**: December 18, 2024  
**Issue**: AI generating `[object Object]` for resources and assessmentMethods fields  
**Root Cause**: llama2 model not following JSON schema properly + improper object-to-string conversion

## Problems Identified

### 1. Wrong Model (llama2)
- **Issue**: llama2 is outdated and poor at structured JSON output
- **Result**: Returns objects when strings expected, ignores schema format
- **Impact**: `resources` and `assessmentMethods` fields show `[object Object]`

### 2. Poor Object Handling
- **Issue**: Code assumed arrays contain strings, but AI returned objects
- **Example**: `[{name: "Book 1", url: "..."}, {name: "Book 2"}]`
- **Current code**: `array.join('\n')` → produces `[object Object]\n[object Object]`

### 3. No JSON Enforcement
- **Issue**: No `format: "json"` parameter sent to Ollama
- **Result**: Model free to return any format, inconsistent structure

## Solutions Implemented

### 1. ✅ Upgraded to qwen2.5:14b Model
**File**: `src/shared/config/index.ts` (line 76)

**Before**:
```typescript
model: process.env.OLLAMA_MODEL || 'llama2',
```

**After**:
```typescript
model: process.env.OLLAMA_MODEL || 'qwen2.5:14b', // Better at structured JSON output
```

**Why qwen2.5:14b**:
- Released 2024, modern architecture
- **Excellent at following JSON schemas**
- Better instruction following
- Understands structured output requirements
- Larger context window (14B parameters)
- Recommended in project documentation

### 2. ✅ Enhanced Object-to-String Conversion
**File**: `src/shared/queues/ai.queue.ts` (lines 1071-1106)

**Before** (naive approach):
```typescript
const assessmentMethodsStr = Array.isArray(parsed.assessmentMethods)
  ? parsed.assessmentMethods.join('\n')
  : parsed.assessmentMethods || '';

const resourcesStr = Array.isArray(parsed.resources)
  ? parsed.resources.join('\n')
  : parsed.resources || '';
```

**After** (robust object handling):
```typescript
// Handle assessmentMethods - extract text from objects if present
const assessmentMethodsStr = Array.isArray(parsed.assessmentMethods)
  ? parsed.assessmentMethods.map((item: any) => {
      if (typeof item === 'object' && item !== null) {
        // Extract meaningful text from object (name, description, method, type, etc.)
        return Object.entries(item)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
      }
      return String(item);
    }).join('\n')
  : parsed.assessmentMethods || '';

// Handle resources - extract text from objects if present  
const resourcesStr = Array.isArray(parsed.resources)
  ? parsed.resources.map((item: any) => {
      if (typeof item === 'object' && item !== null) {
        // Extract meaningful text from object (title, name, url, description, etc.)
        return Object.entries(item)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
      }
      return String(item);
    }).join('\n')
  : parsed.resources || '';
```

**Benefits**:
- Handles both strings AND objects gracefully
- Extracts all fields from objects (name, url, description, etc.)
- Formats as `key: value, key: value` (readable)
- Backward compatible with string arrays

### 3. ✅ Enforced JSON Format
**File**: `src/shared/lib/ollama.ts` (line 108)

**Before**:
```typescript
const requestBody: OllamaGenerateRequest = {
  model: this.model,
  prompt,
  stream: false,
  ...(mergedOptions ? { options: mergedOptions } : {}),
};
```

**After**:
```typescript
const requestBody: any = {
  model: this.model,
  prompt,
  stream: false,
  format: 'json', // Enforce JSON output for structured data (qwen2.5, llama3.2+ support)
  ...(mergedOptions ? { options: mergedOptions } : {}),
};
```

**Why `format: 'json'`**:
- **Forces model to output ONLY valid JSON**
- Supported by qwen2.5, llama3.2+, mistral-nemo
- Prevents text before/after JSON
- Eliminates need for regex extraction
- More reliable parsing

### 4. ✅ Updated Logging
**Files**: 
- `src/shared/queues/ai.queue.ts` (lines 882, 893)

**Changes**:
- Log actual model name from config (not hardcoded "llama2")
- Show dynamic model selection
- Better debugging information

## Expected Results

### Before (with llama2):
```json
{
  "resources": "[object Object]\n[object Object]\n[object Object]",
  "assessmentMethods": "[object Object]\n[object Object]\n[object Object]",
  "teachingHours": null,
  "durationDays": null
}
```

### After (with qwen2.5:14b):
```json
{
  "resources": "title: Physics Textbook, author: Dr. Smith, url: http://example.com/book1\ntitle: Lab Manual, type: PDF, url: http://example.com/manual",
  "assessmentMethods": "method: Weekly quizzes, weight: 10%, description: Short assessments\nmethod: Unit tests, weight: 30%, description: Comprehensive exams",
  "teachingHours": 40,
  "durationDays": 30
}
```

**Improvements**:
- ✅ Readable text instead of `[object Object]`
- ✅ All object fields preserved (name, url, description, etc.)
- ✅ Proper values for teachingHours, durationDays
- ✅ Clean formatting with key:value pairs

## Installation Required

The user needs to install qwen2.5:14b model:

```bash
# Pull the new model (this will download ~8.5GB)
ollama pull qwen2.5:14b

# Verify installation
ollama list

# Expected output should include:
# qwen2.5:14b    14B    8.5GB    ...
```

**Alternative**: If qwen2.5:14b is too large, can use:
```bash
# Smaller but still good alternatives:
ollama pull qwen2.5:7b      # 4.7GB, fast
ollama pull llama3.2:3b     # 2GB, very fast
ollama pull mistral-nemo    # 7GB, also good at JSON
```

## Configuration

The system will automatically use qwen2.5:14b after:
1. Model is pulled via `ollama pull qwen2.5:14b`
2. Server is restarted (to reload config)

**Override via .env** (optional):
```bash
# Use different model if preferred
OLLAMA_MODEL=mistral-nemo:12b-instruct-2407-q6_K
```

## Testing

### 1. Verify Model Available
```bash
ollama list | grep qwen2.5
```

### 2. Test Generation
```bash
# Start server
npm run dev

# Trigger AI syllabus generation via API
curl -X POST http://localhost:3001/api/syllabus/generate \
  -H "Content-Type: application/json" \
  -d '{
    "teacherId": "TEST001",
    "subjectName": "Physics",
    "className": "12",
    "board": "CBSE",
    "term": "1",
    "academicYear": "2024"
  }'
```

### 3. Check Results
- Look for `resources` and `assessmentMethods` fields
- Should see readable text, NOT `[object Object]`
- teachingHours and durationDays should have numeric values

## Fallback Strategy

If qwen2.5:14b doesn't work:

1. **Check model is running**:
   ```bash
   ollama ps
   ```

2. **Try alternative model**:
   ```bash
   export OLLAMA_MODEL=mistral-nemo:12b-instruct-2407-q6_K
   npm run dev
   ```

3. **Increase timeout** (if model is slow):
   ```bash
   export OLLAMA_TIMEOUT=600000  # 10 minutes
   ```

4. **Check Ollama logs**:
   ```bash
   ollama logs
   ```

## Files Changed

### Modified Files (3):
1. **src/shared/config/index.ts**
   - Line 76: Changed default model to qwen2.5:14b
   - Added comment explaining why

2. **src/shared/queues/ai.queue.ts**  
   - Lines 1071-1106: Enhanced object-to-string conversion for resources/assessmentMethods
   - Lines 882, 893: Updated logging to show actual model name

3. **src/shared/lib/ollama.ts**
   - Line 108: Added `format: 'json'` to enforce JSON output
   - Added comment explaining JSON format enforcement

### Build Status
✅ TypeScript compilation successful  
✅ No errors or warnings  
✅ Ready for testing

## Summary

**Root Cause**: llama2 model poor at structured output + improper object handling  
**Solution**: Upgraded to qwen2.5:14b + robust object parsing + JSON enforcement  
**Impact**: Resources and assessmentMethods will show readable text, not `[object Object]`  
**Action Required**: Run `ollama pull qwen2.5:14b` then restart server

---

**Next Steps**:
1. ✅ Pull qwen2.5:14b model: `ollama pull qwen2.5:14b`
2. ✅ Restart server: `npm run dev`
3. ✅ Test AI generation via API
4. ✅ Verify output shows readable text for all fields
