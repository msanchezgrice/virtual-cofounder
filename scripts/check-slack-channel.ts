/**
 * Check what Slack channel is configured
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

import { WebClient } from '@slack/web-api';

async function checkChannel() {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CHANNEL_ID;

  if (!botToken || !channelId) {
    console.error('Missing SLACK_BOT_TOKEN or SLACK_CHANNEL_ID');
    process.exit(1);
  }

  const client = new WebClient(botToken);

  try {
    // Get channel info
    const info = await client.conversations.info({
      channel: channelId,
    });

    if (info.channel) {
      console.log('Slack Channel Configuration:');
      console.log('- ID:', channelId);
      console.log('- Name:', (info.channel as any).name || 'DM');
      console.log('- Type:', (info.channel as any).is_channel ? 'Channel' : (info.channel as any).is_im ? 'DM' : 'Group');
      console.log('- Is Member:', (info.channel as any).is_member);
    }
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

checkChannel();
