import useSound from 'use-sound'

export const useSFX = () => {
  const defaultOption = {
    volume: 0.8,
    interrupt: true
  }

  const [winSFX] = useSound('/sfx/win.wav', defaultOption)
  const [startSFX] = useSound('/sfx/start.wav', defaultOption)
  const [signalSFX] = useSound('/sfx/not-allowed.mp3', defaultOption)

  return {
    winSFX,
    signalSFX,
    startSFX
  }
}
