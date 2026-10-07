export const CATEGORIES = ['Lucky Kiss 💋', 'Truth or Dare 😈', 'Send Mika a Compliment', 'Pick a Number 1–10', 'Mystery Challenge', 'Mika Chooses', 'Double Trouble', 'Spin Again'];
export const TASKS = [
  { id: 't1', type: 'Truth', text: 'What is something you find irresistible?', proof: false },
  { id: 't2', type: 'Truth', text: 'What personality trait is your biggest turn-on?', proof: false },
  { id: 't3', type: 'Truth', text: 'What is the boldest thing you have done on a date?', proof: false },
  { id: 't4', type: 'Truth', text: 'What is something you have always wanted to try on a date?', proof: false },
  { id: 't5', type: 'Truth', text: 'Describe your perfect private date with Mika.', proof: false },
  { id: 't6', type: 'Truth', text: 'Which song would you choose for a slow dance?', proof: false },
  { id: 't7', type: 'Truth', text: 'What small gesture makes you feel appreciated?', proof: false },
  { id: 't8', type: 'Truth', text: 'What is your favourite way to break the ice?', proof: false },
  { id: 'd1', type: 'Dare', text: 'Write Mika your best compliment.', proof: false },
  { id: 'd2', type: 'Dare', text: 'Record a 10-second introduction for Mika, or write it instead.', proof: true },
  { id: 'd3', type: 'Dare', text: 'Take a creative, fully clothed selfie for Mika, or describe your idea.', proof: true },
  { id: 'd4', type: 'Dare', text: 'Show your favourite dance move in a short clip, or tell Mika which move you chose.', proof: true },
  { id: 'd5', type: 'Dare', text: 'Write Mika a cheeky one-line message.', proof: false },
  { id: 'd6', type: 'Dare', text: 'Pick a number from 1–10 and explain why you chose it.', proof: false },
  { id: 'd7', type: 'Dare', text: 'Invent a playful nickname for your dream date together.', proof: false },
  { id: 'd8', type: 'Dare', text: 'Share a photo of your date-night outfit, or describe it.', proof: true },
  { id: 'p1', type: 'Premium challenge', text: 'Plan a three-stop dream date: a place, a song and a thoughtful surprise.', proof: false },
  { id: 'p2', type: 'Premium challenge', text: 'Write Mika a charming introduction using exactly three sentences.', proof: false },
  { id: 'p3', type: 'Premium challenge', text: 'Choose a colour that matches your mood and show or describe something in that colour.', proof: true },
  { id: 'p4', type: 'Premium challenge', text: 'Create a tiny two-line poem that would make Mika smile.', proof: false },
  { id: 'k1', type: 'Playful task', text: 'Describe your perfect goodnight kiss in three words.', proof: false },
  { id: 'k2', type: 'Playful task', text: 'Write a sweet, imaginary goodnight message for Mika.', proof: false },
  { id: 'double1', type: 'Double Trouble', text: 'Name one personality trait you love, then write a compliment using it.', proof: false },
  { id: 'double2', type: 'Double Trouble', text: 'Choose a date-night song and invent a cheeky invitation to go with it.', proof: false },
  { id: 'again', type: 'Playful task', text: 'Choose one word for your mood, or skip and spin again.', proof: false },
];
export function randomIndex(length) {
  const bound = Math.floor(4294967296 / length) * length;
  const bytes = new Uint32Array(1);
  do { crypto.getRandomValues(bytes); } while (bytes[0] >= bound);
  return bytes[0] % length;
}
export function chooseTask(index, used = []) {
  const pool = index === 0 ? TASKS.filter(t => t.id.startsWith('k'))
    : index === 2 ? TASKS.filter(t => ['d1', 'd5'].includes(t.id))
    : index === 3 ? TASKS.filter(t => t.id === 'd6')
    : index === 5 ? TASKS.filter(t => t.type === 'Premium challenge')
    : index === 6 ? TASKS.filter(t => t.type === 'Double Trouble')
    : index === 7 ? TASKS.filter(t => t.id === 'again')
    : TASKS.filter(t => ['Truth', 'Dare'].includes(t.type));
  const fresh = pool.filter(t => !used.includes(t.id));
  const options = fresh.length ? fresh : pool;
  return { ...options[randomIndex(options.length)] };
}
