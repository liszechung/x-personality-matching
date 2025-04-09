import fs from 'fs';
import { select } from '@clack/prompts';

import { checkCouple } from './analyze.js';

const dir = './outputs';
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}

const files = fs.readdirSync(dir).filter((file) => file.endsWith('.tmp'));

const selectedFile = await select({
  message: 'Select the first user to compare:',
  options: files.map((file) => {
    return {
      label: file,
      value: file,
    };
  }),
});

const selectedFile2 = await select({
  message: 'Select the second user to compare:',
  options: files
    .filter((file) => file !== selectedFile)
    .map((file) => {
      return {
        label: file,
        value: file,
      };
    }),
});

const filePath = `${dir}/${selectedFile}`;
const filePath2 = `${dir}/${selectedFile2}`;

const user1Data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
const user2Data = JSON.parse(fs.readFileSync(filePath2, 'utf-8'));

console.log('User 1 Data:', user1Data);
console.log('User 2 Data:', user2Data);

const result = await checkCouple(user1Data, user2Data);
console.log(result);
