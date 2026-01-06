#!/usr/bin/env node

/**
 * Seed script for legal documents via API
 * Creates initial Privacy Policy, Terms of Service, and Help Center documents
 */

const axios = require('axios');

const API_URL = 'http://localhost:3001/api/legal';

const legalDocuments = [
  {
    type: 'PRIVACY_POLICY',
    title: 'Privacy Policy',
    content: `# Privacy Policy

## Last Updated: ${new Date().toLocaleDateString()}

### Introduction
Welcome to Knover Education Platform. We respect your privacy and are committed to protecting your personal data.

### Information We Collect

#### Personal Information
- Name and email address
- Educational institution details
- Profile information you choose to provide

#### Usage Data
- How you interact with our platform
- Learning progress and performance data
- AI interaction history

### How We Use Your Information
- To provide and maintain our service
- To personalize your learning experience
- To improve our AI assistance
- To communicate with you about updates and features

### Data Security
We implement appropriate technical and organizational measures to protect your personal data against unauthorized access, alteration, disclosure, or destruction.

### Your Rights
- Access your personal data
- Request correction of your data
- Request deletion of your data
- Opt-out of certain data processing

### Third-Party Services
We use third-party services for:
- Authentication (Google OAuth)
- AI processing (Ollama)
- Data storage and analytics

### Changes to This Policy
We may update this policy from time to time. We will notify you of any changes by posting the new policy on this page.

### Contact Us
If you have questions about this Privacy Policy, please contact us.`,
    version: '1.0.0',
    author: 'System',
    summary: 'Privacy policy for Knover Education Platform',
  },
  {
    type: 'TERMS_OF_SERVICE',
    title: 'Terms of Service',
    content: `# Terms of Service

## Last Updated: ${new Date().toLocaleDateString()}

### Acceptance of Terms
By accessing and using Knover Education Platform, you accept and agree to be bound by these Terms of Service.

### User Accounts

#### Registration
- You must provide accurate and complete information
- You are responsible for maintaining the security of your account
- You must be at least 13 years old to use this service

#### Account Types
- **Teacher Accounts**: Create and manage educational content
- **Student Accounts**: Access learning materials and AI assistance

### Acceptable Use

#### You May
- Use the platform for educational purposes
- Create and share educational content
- Interact with AI assistance for learning

#### You May Not
- Use the platform for any illegal purposes
- Share inappropriate or harmful content
- Attempt to gain unauthorized access to any part of the service
- Violate intellectual property rights

### AI-Generated Content
- AI assistance is provided as-is for educational purposes
- Users should verify information provided by AI
- AI-generated content should be used as a learning aid, not as a substitute for critical thinking

### Intellectual Property
- You retain ownership of content you create
- By posting content, you grant us a license to use it within the platform
- We respect copyright and expect users to do the same

### Limitation of Liability
The platform is provided "as is" without warranties of any kind. We are not liable for any damages arising from your use of the service.

### Termination
We reserve the right to terminate or suspend accounts that violate these terms.

### Changes to Terms
We may modify these terms at any time. Continued use of the platform constitutes acceptance of modified terms.

### Governing Law
These terms are governed by applicable laws in your jurisdiction.

### Contact
For questions about these Terms of Service, please contact us.`,
    version: '1.0.0',
    author: 'System',
    summary: 'Terms of service for Knover Education Platform',
  },
  {
    type: 'HELP_CENTER',
    title: 'Help Center',
    content: `# Help Center

## Welcome to Knover Education Platform Help

### Getting Started

#### For Teachers
1. **Create an Account**: Sign up with your Google account
2. **Create a Syllabus**: Start by creating your first syllabus
3. **Add Units and Topics**: Structure your content hierarchically
4. **Generate Questions**: Use AI to create questions for assessment
5. **Customize AI Settings**: Adjust AI behavior to match your teaching style

#### For Students
1. **Create an Account**: Sign up with your Google account
2. **Browse Syllabi**: Explore available educational content
3. **Use AI Assistant**: Get help with your studies through our AI chat
4. **Track Progress**: Monitor your learning journey
5. **Customize AI**: Personalize AI responses to match your learning style

### Features

#### AI Chat Assistant
- Ask questions about any topic
- Get explanations in different styles
- Request practice problems
- Customize AI personality and tone

#### Syllabus Management (Teachers)
- Create comprehensive syllabi
- Organize content into units and topics
- Generate AI-powered questions
- Track student progress

#### AI Customization
- **Settings Page**: Adjust AI tone, warmth, and response style
- **Profile Information**: Help AI understand your learning style
- **Custom Instructions**: Give AI specific guidelines for interactions

### Troubleshooting

#### Common Issues

**Can't Sign In**
- Ensure you're using a Google account
- Clear browser cache and cookies
- Try a different browser

**AI Not Responding**
- Check your internet connection
- Refresh the page
- Clear the conversation and start new

**Content Not Loading**
- Refresh the page
- Check if you're logged in
- Try clearing browser cache

#### Database Connection Issues
- The platform requires PostgreSQL database
- Vector extension must be enabled
- Contact support if issues persist

### FAQ

**Q: Is my data secure?**
A: Yes, we implement industry-standard security measures. See our Privacy Policy for details.

**Q: How does AI customization work?**
A: You can adjust AI personality, tone, and provide custom instructions to tailor responses to your needs.

**Q: Can I delete my account?**
A: Yes, contact support to request account deletion.

**Q: Is the platform free?**
A: Pricing information is available on our website.

**Q: What AI models do you use?**
A: We use local Ollama models (Qwen 2.5) for privacy and performance.

### Contact Support

Need more help? Reach out to us:
- Email: support@knover.education
- Response time: Within 24-48 hours

### Resources

- **API Documentation**: For developers
- **Video Tutorials**: Coming soon
- **Community Forum**: Connect with other users`,
    version: '1.0.0',
    author: 'System',
    summary: 'Help center and documentation for Knover Education Platform',
  },
];

async function seedLegalDocuments() {
  console.log('🌱 Seeding legal documents via API...\n');

  for (const doc of legalDocuments) {
    try {
      console.log(`Creating ${doc.type}...`);
      const response = await axios.post(API_URL, doc);
      
      if (response.data.success) {
        console.log(`  ✅ Created ${doc.type} (ID: ${response.data.data.id})\n`);
      } else {
        console.log(`  ⚠️  ${doc.type}: ${response.data.message}\n`);
      }
    } catch (error) {
      if (error.response) {
        console.error(`  ❌ ${doc.type} failed: ${error.response.data.message || error.message}\n`);
      } else {
        console.error(`  ❌ ${doc.type} failed: ${error.message}\n`);
      }
    }
  }

  console.log('✨ Seeding complete!');
}

seedLegalDocuments()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
