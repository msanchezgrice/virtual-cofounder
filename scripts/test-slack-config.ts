/**
 * Test Slack configuration and send a test message
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

import { WebClient } from '@slack/web-api';

async function testSlackConfig() {
  console.log('🔍 Testing Slack configuration...\n');

  // Check environment variables
  const botToken = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CHANNEL_ID;
  const workspaceId = process.env.WORKSPACE_ID;

  console.log('Environment variables:');
  console.log('- SLACK_BOT_TOKEN:', botToken ? '✓ Set' : '✗ Missing');
  console.log('- SLACK_CHANNEL_ID:', channelId || '✗ Missing');
  console.log('- WORKSPACE_ID:', workspaceId || '✗ Missing');
  console.log();

  if (!botToken) {
    console.error('❌ SLACK_BOT_TOKEN not configured');
    process.exit(1);
  }

  const client = new WebClient(botToken);

  try {
    // Test authentication
    console.log('Testing bot authentication...');
    const authTest = await client.auth.test();
    console.log('✓ Bot authenticated successfully');
    console.log('  Team:', authTest.team);
    console.log('  User:', authTest.user);
    console.log('  Bot ID:', authTest.bot_id);
    console.log();

    // List conversations
    console.log('Listing available channels...');
    const conversations = await client.conversations.list({
      types: 'public_channel,private_channel,im',
      limit: 10,
    });

    if (conversations.channels && conversations.channels.length > 0) {
      console.log('✓ Found channels:');
      conversations.channels.forEach((channel: any) => {
        const isCurrent = channel.id === channelId;
        console.log(`  ${isCurrent ? '→' : ' '} ${channel.name || 'DM'} (${channel.id})`);
      });
    } else {
      console.log('✗ No channels found');
    }
    console.log();

    // Send test message if channel is configured
    if (channelId) {
      console.log('Sending test message...');
      const result = await client.chat.postMessage({
        channel: channelId,
        text: '🧪 Test message from Slack configuration script',
      });

      if (result.ok) {
        console.log('✓ Test message sent successfully');
        console.log('  Message TS:', result.ts);
      } else {
        console.log('✗ Failed to send message');
      }
    } else {
      console.log('⚠️  SLACK_CHANNEL_ID not configured - skipping message test');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.data) {
      console.error('   Details:', error.data);
    }
    process.exit(1);
  }

  console.log('\n✓ Slack configuration test complete');
}

testSlackConfig();
