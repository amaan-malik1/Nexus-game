const sounds = {
  correct: "/audio/correct_ans_sound.mp3",
  wrong: "/audio/wrong_ans_sound.mp3",
} as const;

export function playGameSound(type: keyof typeof sounds) {
  const audio = new Audio(sounds[type]);
  audio.volume = 0.8;
  audio.playbackRate = type === "wrong" ? 1.75 : 1;
  void audio.play().catch(() => undefined);
}