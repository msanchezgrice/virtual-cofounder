import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

import { executeStory } from '../workers/execution-worker';

const storyId = process.argv[2] || '64ef190a-e6a4-414d-86f8-190a0dc411ec';

console.log('🧪 Testing execution locally with production DB...');
console.log(`   Story ID: ${storyId}`);
console.log('');

executeStory(storyId)
  .then(() => {
    console.log('\n✅ Execution completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Execution failed:');
    console.error(error.message || error);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  });
