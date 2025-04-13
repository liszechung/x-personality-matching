import 'dotenv/config';
import { intro, outro, text, confirm, spinner, log } from '@clack/prompts';
import fs from 'fs';

import {
  fetchTwitterProfile,
  analyzeUserTweets,
  parseAnalysisResponse,
} from './analyze.js';
// Example usage

intro(
  "This is the program to analyse Twitter user's tweets and personality using the OCEAN (Big Five) model."
);

let confirmed = false;
let firstUser;

while (!confirmed) {
  firstUser = await text({
    message: 'Enter the username of the Twitter user (e.g., @username):',
    validate(value) {
      if (!value.trim()) return 'Username cannot be empty.';
      return undefined;
    },
  });

  confirmed = await confirm({
    message: `You entered the user as "${firstUser}". Confirm or re-enter the username:`,
    validate(value) {
      if (!value.trim()) return 'Username cannot be empty.';
      return undefined;
    },
  });
}

const s = spinner();

const user = firstUser;
s.start(`Fetching profile for ${user}...`);
const [profile, cleanUsername] = await fetchTwitterProfile(user);
if (!profile) {
  console.error(`Failed to fetch profile for ${user}`);
}

log.step(`Fetched profile for @${cleanUsername}, now analyzing...`);
const result = await analyzeUserTweets(profile, cleanUsername);
const parsedResult = parseAnalysisResponse(result);

const userResult = {
  username: cleanUsername,
  analysis: parsedResult,
};
s.stop(`Finish anlayzing profile for ${user}...`);

const dir = './outputs';
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}

await fs.writeFileSync(
  `${dir}/${user}.tmp`,
  JSON.stringify(userResult, null, 4)
);

outro('Done! The input profile has been analyzed.');
