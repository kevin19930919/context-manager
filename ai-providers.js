const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

/**
 * Base AI Provider class
 */
class AIProvider {
  async chat(messages, contexts) {
    throw new Error('chat() must be implemented by subclass');
  }

  /**
   * Format contexts into a system message
   */
  formatContextsForPrompt(contexts) {
    if (!contexts || contexts.length === 0) {
      return 'No contexts available.';
    }

    let prompt = 'Here are the user\'s saved contexts:\n\n';

    contexts.forEach((ctx, index) => {
      prompt += `### Context ${index + 1}\n`;
      prompt += `- Time: ${new Date(ctx.timestamp).toLocaleString()}\n`;
      prompt += `- Project: ${ctx.project}\n`;

      if (ctx.tags && ctx.tags.length > 0) {
        prompt += `- Tags: ${ctx.tags.join(', ')}\n`;
      }

      if (ctx.note) {
        prompt += `- Note: ${ctx.note}\n`;
      }

      if (ctx.type === 'text' && ctx.textContent) {
        prompt += `- Content:\n${ctx.textContent}\n`;
      } else if (ctx.type === 'screenshot') {
        prompt += `- Type: Screenshot\n`;
      }

      prompt += '\n';
    });

    return prompt;
  }
}

/**
 * Claude (Anthropic) Provider
 */
class ClaudeProvider extends AIProvider {
  constructor(apiKey, model = 'claude-3-5-sonnet-20241022') {
    super();
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async chat(messages, contexts) {
    // Separate text and screenshot contexts
    const textContexts = contexts.filter(ctx => ctx.type === 'text');
    const screenshotContexts = contexts.filter(ctx => ctx.type === 'screenshot' && ctx.screenshotPath);

    // Build system prompt with text contexts
    const systemPrompt = `You are a helpful AI assistant with access to the user's saved contexts.

${this.formatContextsForPrompt(textContexts)}

${screenshotContexts.length > 0 ? `\nNote: The user has also selected ${screenshotContexts.length} screenshot(s) which you can see in the conversation.` : ''}

Your role is to help the user understand, organize, and query their contexts. You can:
- Answer questions about specific contexts
- Summarize information across contexts
- Find patterns or connections
- Help organize and categorize information

Be concise and helpful.`;

    // If there are screenshots, we need to add them to the first user message
    let enhancedMessages = [...messages];

    if (screenshotContexts.length > 0 && messages.length > 0) {
      // Find the last user message
      const lastUserMsgIndex = messages.length - 1;
      const lastUserMsg = messages[lastUserMsgIndex];

      if (lastUserMsg.role === 'user') {
        // Build content array with text and images
        const contentArray = [
          {
            type: 'text',
            text: lastUserMsg.content
          }
        ];

        // Add screenshot images
        for (const ctx of screenshotContexts) {
          try {
            const imageBuffer = fs.readFileSync(ctx.screenshotPath);
            const base64Image = imageBuffer.toString('base64');

            const ext = path.extname(ctx.screenshotPath).toLowerCase();
            const mediaTypeMap = {
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.png': 'image/png',
              '.gif': 'image/gif',
              '.webp': 'image/webp'
            };
            const mediaType = mediaTypeMap[ext] || 'image/jpeg';

            contentArray.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Image
              }
            });

            // Add context info as text
            contentArray.push({
              type: 'text',
              text: `\n[Screenshot Context - ${ctx.project}]\nTime: ${new Date(ctx.timestamp).toLocaleString()}\n${ctx.note ? 'Note: ' + ctx.note : ''}\n${ctx.tags?.length > 0 ? 'Tags: ' + ctx.tags.join(', ') : ''}`
            });
          } catch (error) {
            console.error(`Failed to load screenshot: ${ctx.screenshotPath}`, error);
          }
        }

        // Replace the last user message with enhanced version
        enhancedMessages = [
          ...messages.slice(0, lastUserMsgIndex),
          {
            role: 'user',
            content: contentArray
          }
        ];
      }
    }

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2000,
      system: systemPrompt,
      messages: enhancedMessages
    });

    return response.content[0].text;
  }

  /**
   * Analyze an image and generate relevant tags
   * @param {string} imagePath - Path to the image file
   * @returns {Promise<Array<string>>} - Array of generated tags
   */
  async analyzeImage(imagePath) {
    try {
      // Read and encode image to base64
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');

      // Determine media type from file extension
      const ext = path.extname(imagePath).toLowerCase();
      const mediaTypeMap = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
      };
      const mediaType = mediaTypeMap[ext] || 'image/jpeg';

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Image
              }
            },
            {
              type: 'text',
              text: `Analyze this screenshot/image and generate 3-5 relevant tags that describe its content.

Focus on:
- What type of content it is (code, design, documentation, error, UI, etc.)
- Programming languages or technologies visible
- Main topics or concepts
- Any notable features

Return ONLY the tags as a JSON array of strings, like: ["tag1", "tag2", "tag3"]
Keep tags concise (1-3 words each) and relevant for a developer's context manager.`
            }
          ]
        }]
      });

      const responseText = response.content[0].text.trim();

      // Try to parse JSON response
      try {
        // Remove markdown code blocks if present
        const jsonMatch = responseText.match(/\[.*\]/s);
        if (jsonMatch) {
          const tags = JSON.parse(jsonMatch[0]);
          return tags.filter(tag => typeof tag === 'string' && tag.length > 0);
        }
      } catch (e) {
        console.error('Failed to parse AI response as JSON:', e);
      }

      // Fallback: extract words that look like tags
      const words = responseText.split(/[\s,]+/).filter(w => w.length > 2);
      return words.slice(0, 5);
    } catch (error) {
      console.error('Error analyzing image:', error);
      return [];
    }
  }

  /**
   * Describe an image in natural language
   * @param {string} imagePath - Path to the image file
   * @returns {Promise<string>} - Text description of the image
   */
  async describeImage(imagePath) {
    try {
      // Read and encode image to base64
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');

      // Determine media type from file extension
      const ext = path.extname(imagePath).toLowerCase();
      const mediaTypeMap = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
      };
      const mediaType = mediaTypeMap[ext] || 'image/jpeg';

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Image
              }
            },
            {
              type: 'text',
              text: `Describe this screenshot/image concisely in 2-3 sentences.

Focus on:
- What is shown in the image (code, UI, error, documentation, etc.)
- Key details that would help someone understand the context
- Any important text, code, or visual elements

Write in a clear, professional tone suitable for a developer's notes.`
            }
          ]
        }]
      });

      return response.content[0].text.trim();
    } catch (error) {
      console.error('Error describing image:', error);
      throw error;
    }
  }

  /**
   * Generate a concise note for a screenshot (for auto-generation when saving)
   */
  async generateImageNote(imagePath) {
    try {
      // Read and encode image to base64
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');

      // Determine media type from file extension
      const ext = path.extname(imagePath).toLowerCase();
      const mediaTypeMap = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
      };
      const mediaType = mediaTypeMap[ext] || 'image/jpeg';

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Image
              }
            },
            {
              type: 'text',
              text: `Generate a brief, helpful note (1-2 sentences) for this screenshot.

The note should:
- Be concise and to the point
- Describe what's shown (e.g., "Login page design", "API error message", "Database schema")
- Help quickly identify the content later
- Use clear, simple language

Just provide the note text without any prefix or formatting.`
            }
          ]
        }]
      });

      return response.content[0].text.trim();
    } catch (error) {
      console.error('Error generating image note:', error);
      throw error;
    }
  }
}

/**
 * OpenAI Provider
 */
class OpenAIProvider extends AIProvider {
  constructor(apiKey, model = 'gpt-4o') {
    super();
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async chat(messages, contexts) {
    // Separate text and screenshot contexts
    const textContexts = contexts.filter(ctx => ctx.type === 'text');
    const screenshotContexts = contexts.filter(ctx => ctx.type === 'screenshot' && ctx.screenshotPath);

    // Build system prompt with text contexts
    const systemPrompt = `You are a helpful AI assistant with access to the user's saved contexts.

${this.formatContextsForPrompt(textContexts)}

${screenshotContexts.length > 0 ? `\nNote: The user has also selected ${screenshotContexts.length} screenshot(s) which you can see in the conversation.` : ''}

Your role is to help the user understand, organize, and query their contexts. You can:
- Answer questions about specific contexts
- Summarize information across contexts
- Find patterns or connections
- Help organize and categorize information

Be concise and helpful.`;

    // If there are screenshots, we need to add them to the last user message
    let enhancedMessages = [...messages];

    if (screenshotContexts.length > 0 && messages.length > 0) {
      // Find the last user message
      const lastUserMsgIndex = messages.length - 1;
      const lastUserMsg = messages[lastUserMsgIndex];

      if (lastUserMsg.role === 'user') {
        // Build content array with text and images
        const contentArray = [
          {
            type: 'text',
            text: lastUserMsg.content
          }
        ];

        // Add screenshot images
        for (const ctx of screenshotContexts) {
          try {
            const imageBuffer = fs.readFileSync(ctx.screenshotPath);
            const base64Image = imageBuffer.toString('base64');

            const ext = path.extname(ctx.screenshotPath).toLowerCase();
            const mediaTypeMap = {
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.png': 'image/png',
              '.gif': 'image/gif',
              '.webp': 'image/webp'
            };
            const mediaType = mediaTypeMap[ext] || 'image/jpeg';

            contentArray.push({
              type: 'image_url',
              image_url: {
                url: `data:${mediaType};base64,${base64Image}`
              }
            });

            // Add context info as text
            contentArray.push({
              type: 'text',
              text: `\n[Screenshot Context - ${ctx.project}]\nTime: ${new Date(ctx.timestamp).toLocaleString()}\n${ctx.note ? 'Note: ' + ctx.note : ''}\n${ctx.tags?.length > 0 ? 'Tags: ' + ctx.tags.join(', ') : ''}`
            });
          } catch (error) {
            console.error(`Failed to load screenshot: ${ctx.screenshotPath}`, error);
          }
        }

        // Replace the last user message with enhanced version
        enhancedMessages = [
          ...messages.slice(0, lastUserMsgIndex),
          {
            role: 'user',
            content: contentArray
          }
        ];
      }
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...enhancedMessages
      ],
      max_tokens: 2000
    });

    return response.choices[0].message.content;
  }
}

module.exports = {
  ClaudeProvider,
  OpenAIProvider
};
