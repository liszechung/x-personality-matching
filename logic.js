import dedent from 'dedent';
import 'dotenv/config';
import { intro, outro, text, confirm, spinner, log } from '@clack/prompts';

const parseExaUserString = (raw_string) => {
  try {
    let composed_object = {
      tweets: [],
    };
    const base_yml = raw_string;
    const profile_yml = base_yml.match(/^.*?statuses_count:\s*\d+/)?.[0];
    const tweets_yml = base_yml
      .replace(profile_yml, '')
      .replace('| location:', '')
      .trim();

    const PROFILE_PATTERNS = {
      bio: /^(.*?)(?=\| (?:profile_url:|name:|created_at:|followers_count:|favourites_count:|friends_count:|media_count:|statuses_count:|location:))/,
      profile_url: /\| profile_url:\s*([^\s|]+)/,
      name: /\| name:\s*([^|]+)/,
      created_at: /\| created_at:\s*([^|]+)/,
      followers_count: /\| followers_count:\s*([^|]+)/,
      statuses_count: /\| statuses_count:\s*([^|]+)/,
      location: /\| location:\s*([^|]+)/,
    };

    const num_keys = [
      'followers_count',
      'favourites_count',
      'friends_count',
      'media_count',
      'statuses_count',
      'favorite_count',
      'quote_count',
      'reply_count',
      'retweet_count',
    ];
    for (const [key, pattern] of Object.entries(PROFILE_PATTERNS)) {
      const match = profile_yml?.match(pattern);
      if (match) {
        Object.assign(composed_object, {
          [key]: num_keys.includes(key)
            ? parseInt(match[1].trim())
            : match[1].trim(),
        });
      }
    }

    const each_tweet_yml = tweets_yml.split(/\| lang: [a-z]{2,3}(?:\s|$)/);

    const TWEET_PATTERNS = {
      created_at: /\| created_at:\s*([^|]+)/,
      favorite_count: /\| favorite_count:\s*([^|]+)/,
      quote_count: /\| quote_count:\s*([^|]+)/,
      reply_count: /\| reply_count:\s*([^|]+)/,
      retweet_count: /\| retweet_count:\s*([^|]+)/,
      is_quote_status: /\| is_quote_status:\s*([^|]+)/,
    };

    for (const tweet of each_tweet_yml) {
      const tweet_object = {};
      for (const [key, pattern] of Object.entries(TWEET_PATTERNS)) {
        const match = tweet.match(pattern);
        if (match) {
          if (key === 'is_quote_status') {
            Object.assign(tweet_object, { [key]: match[1].trim() === 'True' });
          } else {
            Object.assign(tweet_object, {
              [key]: num_keys.includes(key)
                ? parseInt(match[1].trim())
                : match[1].trim(),
            });
          }
        }
      }

      const tweet_text = tweet
        .replace(TWEET_PATTERNS.created_at, '')
        .replace(TWEET_PATTERNS.favorite_count, '')
        .replace(TWEET_PATTERNS.quote_count, '')
        .replace(TWEET_PATTERNS.reply_count, '')
        .replace(TWEET_PATTERNS.retweet_count, '')
        .replace(TWEET_PATTERNS.is_quote_status, '')
        .trim();
      Object.assign(tweet_object, { text: tweet_text });

      composed_object.tweets.push(tweet_object);
    }

    composed_object.tweets = composed_object.tweets.filter(
      (tweet) => tweet.text.length > 0
    );

    return { success: true, data: composed_object };
  } catch (error) {
    console.error(error);
    return { success: false, error: error };
  }
};

const fetchTwitterProfile = async (username) => {
  try {
    const cleanUsername = username.trim().replace(/^@/, '');
    const response = await fetch('https://api.exa.ai/contents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.EXA_API_KEY || ''}`,
      },
      body: JSON.stringify({
        ids: [`https://x.com/${cleanUsername}`],
        text: true,
        livecrawl: 'always',
      }),
    });

    const rawData = await response.json();

    const data = rawData.data ? rawData.data : rawData;

    const parsedData = parseExaUserString(data.results[0].text);
    if (!parsedData.success || !parsedData.data) {
      console.error('Error parsing tweets:', parsedData.error);
      return null;
    }

    const tweets = parsedData.data.tweets;

    console.log(`Found ${tweets.length} tweets for @${cleanUsername}`);

    return [parsedData.data, cleanUsername];
  } catch (error) {
    console.error('Error fetching Twitter profile:', error);
    return null;
  }
};

const analyzeUserTweets = async (profile, cleanUsername) => {
  const profile_str = JSON.stringify(
    { ...profile, tweets: undefined },
    null,
    2
  );

  const tweetTexts = profile.tweets
    .map(
      (tweet) =>
        `<post${tweet.is_quote_status ? ' is_quote="true"' : ''}>
${tweet.text}
${tweet.favorite_count} likes, ${tweet.reply_count} replies, ${
          tweet.retweet_count
        } retweets, ${tweet.quote_count} quotes
</post>`
    )
    .join('\n\n');

  const messages = [
    {
      role: 'system',
      content: dedent`
        Analyze the following tweets from the given Twitter user and assess their personality based on the OCEAN (Big Five) model.


        The OCEAN model consists of five personality traits:
        - Openness: Appreciation for art, emotion, adventure, unusual ideas, curiosity, and variety of experience.
        - Conscientiousness: Tendency to be organized, dependable, show self-discipline, act dutifully, aim for achievement, and prefer planned rather than spontaneous behavior.
        - Extraversion: Energy, positive emotions, surgency, assertiveness, sociability, and the tendency to seek stimulation in the company of others.
        - Agreeableness: Tendency to be compassionate and cooperative rather than suspicious and antagonistic towards others.
        - Neuroticism: Tendency to experience unpleasant emotions easily, such as anger, anxiety, depression, and vulnerability.


        Provide OCEAN index from 0 to 5 for each trait, where 0 is very low and 5 is very high. The OCEAN index should be in the format of format of {o:1,c:1,e:1,a:1,n:1}. Also, provide a brief explanation for your assessment.
      `.trim(),
    },
    {
      role: 'user',
      content: dedent`Username: @${cleanUsername}
<user_tweets filter="top_100">
${tweetTexts}
</user_tweets>`.trim(),
    },
  ];

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-2-latest',
      messages, // Adjust per XAI’s format
    }),
  });

  const responseData = await response.json();
  if (responseData.error) {
    console.error('Error analyzing tweets:', responseData.error);
    return null;
  }
  console.log('responseData');
  console.log(responseData);

  const choices = responseData.choices;
  console.log(choices);
};
// Example usage

intro(
  "This is the program to analyse Twitter user's tweets and personality using the OCEAN (Big Five) model. Two users will be analyzed. "
);

let confirmed = false;
let firstUser;
let secondUser;

while (!confirmed) {
  firstUser = await text({
    message: 'Enter the username of the first Twitter user (e.g., @username):',
    validate(value) {
      if (!value.trim()) return 'Username cannot be empty.';
      return undefined;
    },
  });

  secondUser = await text({
    message: 'Enter the username of the second Twitter user (e.g., @username):',
    validate(value) {
      if (!value.trim()) return 'Username cannot be empty.';
      return undefined;
    },
  });

  confirmed = await confirm({
    message: `You entered the first user as "${firstUser}" and second user as "${secondUser}". Confirm or re-enter the username:`,
    validate(value) {
      if (!value.trim()) return 'Username cannot be empty.';
      return undefined;
    },
  });
}

const s = spinner();

for (const user of [firstUser, secondUser]) {
  s.start(`Fetching profile for ${user}...`);
  const [profile, cleanUsername] = await fetchTwitterProfile(user);
  if (!profile) {
    console.error(`Failed to fetch profile for ${user}`);
    continue;
  }

  log.step(`Fetched profile for @${cleanUsername}, now analyzing...`);
  await analyzeUserTweets(profile, cleanUsername);
  s.stop(`Finish alayzing profile for ${user}...`);
}

outro('Done! All profiles have been analyzed.');
