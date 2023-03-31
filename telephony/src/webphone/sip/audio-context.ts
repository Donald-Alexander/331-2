function createAudioContext(): AudioContext  {
  return new ((window as any).AudioContext || (window as any).webkitAudioContext);
}

export const audioContext = createAudioContext();
