/**
 * 本地离线语音克隆测试脚本
 * 测试核心音频分析函数（基频检测、频谱分析、共振峰估计、声音分类）
 * 生成合成测试音频并验证完整流水线
 */

import { writeFileSync, readFileSync, mkdirSync } from 'fs'

// ========== 生成测试 WAV 文件 ==========

function generateWav(frequency, durationSec, sampleRate = 44100, amplitude = 0.5) {
  const numSamples = Math.floor(sampleRate * durationSec)
  const numChannels = 1
  const bitsPerSample = 16
  const dataSize = numSamples * numChannels * (bitsPerSample / 8)
  const buffer = Buffer.alloc(44 + dataSize)

  // RIFF header
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)

  // fmt chunk
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28)
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32)
  buffer.writeUInt16LE(bitsPerSample, 34)

  // data chunk
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  // Generate sine wave with vibrato for realism
  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    // Add slight vibrato (5Hz modulation, ±3Hz)
    const vibrato = Math.sin(2 * Math.PI * 5 * t) * 3
    const freq = frequency + vibrato
    const sample = amplitude * Math.sin(2 * Math.PI * freq * t)
    // Add slight harmonics for realism
    const harmonic = amplitude * 0.15 * Math.sin(2 * Math.PI * freq * 2 * t)
    const value = (sample + harmonic) * 0.9
    const intSample = Math.max(-32768, Math.min(32767, Math.floor(value * 32767)))
    buffer.writeInt16LE(intSample, offset)
    offset += 2
  }

  return buffer
}

// ========== 核心 DSP 函数（从 voiceCloning.js 移植） ==========

function computeRMS(channelData) {
  let sum = 0
  for (let i = 0; i < channelData.length; i++) {
    sum += channelData[i] * channelData[i]
  }
  return Math.sqrt(sum / channelData.length)
}

function detectF0Frames(channelData, sampleRate) {
  const frameSize = Math.floor(sampleRate * 0.04)
  const hopSize = Math.floor(sampleRate * 0.02)
  const f0Values = []
  const minLag = Math.floor(sampleRate / 500)
  const maxLag = Math.floor(sampleRate / 50)

  for (let start = 0; start + frameSize < channelData.length; start += hopSize) {
    const frame = channelData.slice(start, start + frameSize)
    const frameEnergy = computeRMS(frame)
    if (frameEnergy < 0.005) {
      f0Values.push(0)
      continue
    }

    // 自相关（归一化：除以参与计算的项数，避免短 lag 被优先）
    let bestLag = 0
    let bestNormCorr = 0
    let frameTotalEnergy = 0
    for (let i = 0; i < frameSize; i++) {
      frameTotalEnergy += frame[i] * frame[i]
    }

    for (let lag = minLag; lag < maxLag; lag++) {
      let corr = 0
      const n = frameSize - lag
      for (let i = 0; i < n; i++) {
        corr += frame[i] * frame[i + lag]
      }
      const normCorr = corr / n
      if (frameTotalEnergy > 0) {
        const normalized = normCorr / (frameTotalEnergy / frameSize)
        if (normalized > bestNormCorr) {
          bestNormCorr = normalized
          bestLag = lag
        }
      }
    }

    if (bestLag > 0 && bestNormCorr > 0.01) {
      f0Values.push(sampleRate / bestLag)
    } else {
      f0Values.push(0)
    }
  }

  return f0Values
}

function computeSpectralEnvelope(channelData, sampleRate) {
  const fftSize = 1024
  const hopSize = fftSize / 2
  const numFrames = Math.floor((channelData.length - fftSize) / hopSize)
  if (numFrames <= 0) return new Float32Array(fftSize / 2)

  const avgSpectrum = new Float32Array(fftSize / 2)

  for (let frame = 0; frame < numFrames; frame++) {
    const offset = frame * hopSize
    const segment = channelData.slice(offset, offset + fftSize)
    const windowed = new Float32Array(fftSize)
    for (let i = 0; i < fftSize; i++) {
      windowed[i] = segment[i] * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (fftSize - 1)))
    }
    const magnitudes = computeMagnitudeSpectrum(windowed)
    for (let i = 0; i < fftSize / 2; i++) {
      avgSpectrum[i] += magnitudes[i]
    }
  }

  for (let i = 0; i < fftSize / 2; i++) {
    avgSpectrum[i] /= numFrames
  }

  return avgSpectrum
}

function computeMagnitudeSpectrum(windowed) {
  const N = windowed.length
  const halfN = N / 2
  const magnitudes = new Float32Array(halfN)
  for (let k = 0; k < halfN; k++) {
    let real = 0, imag = 0
    const angle = (2 * Math.PI * k) / N
    for (let n = 0; n < N; n++) {
      real += windowed[n] * Math.cos(angle * n)
      imag -= windowed[n] * Math.sin(angle * n)
    }
    magnitudes[k] = Math.sqrt(real * real + imag * imag)
  }
  return magnitudes
}

function estimateFormants(spectralEnvelope, sampleRate) {
  const fftSize = (spectralEnvelope.length - 1) * 2
  const freqResolution = sampleRate / fftSize
  const formants = []
  const ranges = [
    { min: 200, max: 1000 },
    { min: 800, max: 2500 },
    { min: 2000, max: 3500 },
  ]

  for (const range of ranges) {
    const startBin = Math.floor(range.min / freqResolution)
    const endBin = Math.min(Math.floor(range.max / freqResolution), spectralEnvelope.length - 1)
    let peakBin = startBin
    let peakVal = 0
    for (let i = startBin; i <= endBin; i++) {
      if (spectralEnvelope[i] > peakVal) {
        peakVal = spectralEnvelope[i]
        peakBin = i
      }
    }
    if (peakVal > 0) {
      formants.push(peakBin * freqResolution)
    }
  }

  return formants
}

function computeSpectralTilt(spectralEnvelope) {
  const len = spectralEnvelope.length
  if (len < 20) return 0
  const lowEnd = Math.floor(len / 8)
  let lowEnergy = 0
  for (let i = 0; i < lowEnd; i++) {
    lowEnergy += spectralEnvelope[i] * spectralEnvelope[i]
  }
  lowEnergy = lowEnergy > 0 ? 10 * Math.log10(lowEnergy / lowEnd) : -60

  const highStart = Math.floor(len * 3 / 4)
  let highEnergy = 0
  let highCount = 0
  for (let i = highStart; i < len; i++) {
    highEnergy += spectralEnvelope[i] * spectralEnvelope[i]
    highCount++
  }
  highEnergy = highEnergy > 0 ? 10 * Math.log10(highEnergy / highCount) : -60

  return lowEnergy - highEnergy
}

function classifyVoice(f0Mean, rmsEnergy) {
  let gender = 'unknown'
  let pitchCategory = 'medium'
  let estimatedPitch = 1.0
  let estimatedSpeed = 1.0

  if (f0Mean > 0) {
    if (f0Mean < 100) {
      estimatedPitch = 0.5; pitchCategory = 'low'; gender = 'male'
    } else if (f0Mean < 130) {
      estimatedPitch = 0.65; pitchCategory = 'medium-low'; gender = 'male'
    } else if (f0Mean < 165) {
      estimatedPitch = 0.8; pitchCategory = 'medium'; gender = 'male'
    } else if (f0Mean < 200) {
      estimatedPitch = 1.0; pitchCategory = 'medium'; gender = 'female'
    } else if (f0Mean < 260) {
      estimatedPitch = 1.3; pitchCategory = 'medium-high'; gender = 'female'
    } else {
      estimatedPitch = 1.6; pitchCategory = 'high'; gender = 'female'
    }
  }

  if (rmsEnergy > 0.3) estimatedSpeed = 1.15
  else if (rmsEnergy > 0.15) estimatedSpeed = 1.05
  else if (rmsEnergy < 0.05) estimatedSpeed = 0.85
  else if (rmsEnergy < 0.1) estimatedSpeed = 0.95

  return { gender, pitchCategory, estimatedPitch, estimatedSpeed }
}

// ========== 完整流水线测试 ==========

function runVoiceClonePipeline(audioPath, expectedFreq, expectedGender) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`测试: ${audioPath} (预期基频 ~${expectedFreq}Hz, ${expectedGender})`)
  console.log('='.repeat(60))

  // 1. 读取音频数据
  const wavBuffer = readFileSync(audioPath)

  // 解析 WAV 头
  const sampleRate = wavBuffer.readUInt32LE(24)
  const numChannels = wavBuffer.readUInt16LE(22)
  const bitsPerSample = wavBuffer.readUInt16LE(34)
  const dataSize = wavBuffer.readUInt32LE(40)
  const numSamples = dataSize / (bitsPerSample / 8) / numChannels
  const duration = numSamples / sampleRate

  console.log(`\n[1] 音频信息:`)
  console.log(`  采样率: ${sampleRate}Hz`)
  console.log(`  声道数: ${numChannels}`)
  console.log(`  位深度: ${bitsPerSample}bit`)
  console.log(`  样本数: ${numSamples}`)
  console.log(`  时长: ${duration.toFixed(2)}s`)

  // 2. 转换为 Float32Array
  const channelData = new Float32Array(numSamples)
  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    const sample = wavBuffer.readInt16LE(offset)
    channelData[i] = sample / 32768
    offset += 2
  }

  console.log(`\n[2] 能量分析:`)
  const rmsEnergy = computeRMS(channelData)
  console.log(`  RMS 能量: ${rmsEnergy.toFixed(4)}`)

  console.log(`\n[3] 基频检测 (自相关法):`)
  const f0Frames = detectF0Frames(channelData, sampleRate)
  const f0Values = f0Frames.filter(f => f > 50 && f < 500)
  console.log(`  总帧数: ${f0Frames.length}`)
  console.log(`  有效帧数: ${f0Values.length}`)

  let f0Mean = 0, f0Median = 0
  if (f0Values.length > 0) {
    f0Values.sort((a, b) => a - b)
    f0Mean = f0Values.reduce((s, v) => s + v, 0) / f0Values.length
    const f0Min = f0Values[0]
    const f0Max = f0Values[f0Values.length - 1]
    f0Median = f0Values[Math.floor(f0Values.length / 2)]
    console.log(`  基频均值: ${f0Mean.toFixed(1)}Hz`)
    console.log(`  基频中位数: ${f0Median.toFixed(1)}Hz`)
    console.log(`  基频范围: ${f0Min.toFixed(0)}-${f0Max.toFixed(0)}Hz`)
    console.log(`  预期基频: ~${expectedFreq}Hz`)
    console.log(`  偏差: ${Math.abs(f0Mean - expectedFreq).toFixed(1)}Hz (${(Math.abs(f0Mean - expectedFreq) / expectedFreq * 100).toFixed(1)}%)`)

    // 验证基频检测精度
    const error = Math.abs(f0Mean - expectedFreq) / expectedFreq
    if (error < 0.15) {
      console.log(`  ✓ 基频检测通过 (误差 < 15%)`)
    } else if (error < 0.25) {
      console.log(`  ⚠ 基频检测偏差较大但可接受 (误差 < 25%)`)
    } else {
      console.log(`  ✗ 基频检测偏差过大`)
    }
  } else {
    console.log(`  ✗ 未检测到有效基频`)
  }

  console.log(`\n[4] 频谱分析:`)
  const spectralEnvelope = computeSpectralEnvelope(channelData, sampleRate)
  console.log(`  频谱点数: ${spectralEnvelope.length}`)
  console.log(`  频率分辨率: ${(sampleRate / (spectralEnvelope.length * 2)).toFixed(1)}Hz/点`)

  console.log(`\n[5] 共振峰估计:`)
  const formants = estimateFormants(spectralEnvelope, sampleRate)
  console.log(`  共振峰: ${formants.map(f => f.toFixed(0) + 'Hz').join(', ')}`)
  if (formants.length >= 2) {
    console.log(`  ✓ 成功提取 ${formants.length} 个共振峰`)
  } else if (formants.length > 0) {
    console.log(`  ⚠ 仅提取到 ${formants.length} 个共振峰`)
  } else {
    console.log(`  ✗ 未提取到共振峰`)
  }

  console.log(`\n[6] 频谱倾斜:`)
  const spectralTilt = computeSpectralTilt(spectralEnvelope)
  console.log(`  频谱倾斜: ${spectralTilt.toFixed(1)} dB/octave`)

  console.log(`\n[7] 声音分类:`)
  const classification = classifyVoice(f0Median || f0Mean, rmsEnergy)
  console.log(`  性别: ${classification.gender}`)
  console.log(`  音高分类: ${classification.pitchCategory}`)
  console.log(`  预估音调参数: ${classification.estimatedPitch.toFixed(2)} (前端 pitch 滑块值)`)
  console.log(`  预估语速参数: ${classification.estimatedSpeed.toFixed(2)} (前端 speed 滑块值)`)

  if (classification.gender === expectedGender) {
    console.log(`  ✓ 性别分类正确`)
  } else {
    console.log(`  ✗ 性别分类错误 (预期: ${expectedGender}, 实际: ${classification.gender})`)
  }

  // 返回完整分析结果
  return {
    f0Mean,
    f0Min: f0Values.length > 0 ? f0Values[0] : 0,
    f0Max: f0Values.length > 0 ? f0Values[f0Values.length - 1] : 0,
    spectralEnvelope: Array.from(spectralEnvelope.slice(0, 10)),
    formants,
    spectralTilt,
    gender: classification.gender,
    pitchCategory: classification.pitchCategory,
    estimatedPitch: classification.estimatedPitch,
    estimatedSpeed: classification.estimatedSpeed,
    sampleRate,
    duration,
    rmsEnergy,
  }
}

// ========== 主测试流程 ==========

console.log('╔══════════════════════════════════════════════════════╗')
console.log('║     本地离线语音克隆 - 核心流水线测试               ║')
console.log('╚══════════════════════════════════════════════════════╝')

// 生成测试音频
const testDir = '/workspace/ai-chat-app/test_audio'
mkdirSync(testDir, { recursive: true })

console.log('\n生成测试音频...')

// 女性声音 (~220Hz)
const femaleWav = generateWav(220, 3.0, 44100, 0.5)
writeFileSync(`${testDir}/female_voice.wav`, femaleWav)
console.log('  ✓ female_voice.wav (220Hz, 3s)')

// 男性声音 (~120Hz)
const maleWav = generateWav(120, 3.0, 44100, 0.5)
writeFileSync(`${testDir}/male_voice.wav`, maleWav)
console.log('  ✓ male_voice.wav (120Hz, 3s)')

// 少年声音 (~300Hz)
const childWav = generateWav(300, 3.0, 44100, 0.4)
writeFileSync(`${testDir}/child_voice.wav`, childWav)
console.log('  ✓ child_voice.wav (300Hz, 3s)')

// 长音频 (~10s)
const longWav = generateWav(180, 10.0, 44100, 0.45)
writeFileSync(`${testDir}/long_voice.wav`, longWav)
console.log('  ✓ long_voice.wav (180Hz, 10s)')

// 测试所有音频
const results = []

results.push(runVoiceClonePipeline(`${testDir}/female_voice.wav`, 220, 'female'))
results.push(runVoiceClonePipeline(`${testDir}/male_voice.wav`, 120, 'male'))
results.push(runVoiceClonePipeline(`${testDir}/child_voice.wav`, 300, 'female'))
results.push(runVoiceClonePipeline(`${testDir}/long_voice.wav`, 180, 'female'))

// ========== 测试总结 ==========

console.log(`\n${'='.repeat(60)}`)
console.log('测试总结')
console.log('='.repeat(60))

const labels = ['女性声音 (220Hz)', '男性声音 (120Hz)', '少年声音 (300Hz)', '长音频 (180Hz, 10s)']
let allPassed = true

for (let i = 0; i < results.length; i++) {
  const r = results[i]
  const expectedFreqs = [220, 120, 300, 180]
  const expectedGenders = ['female', 'male', 'female', 'female']
  const freqOk = r.f0Mean > 0 && Math.abs(r.f0Mean - expectedFreqs[i]) / expectedFreqs[i] < 0.25
  const genderOk = r.gender === expectedGenders[i]
  const formantsOk = r.formants.length >= 1
  const status = (freqOk && genderOk && formantsOk) ? '✓ 通过' : '✗ 失败'

  if (!freqOk || !genderOk || !formantsOk) allPassed = false

  console.log(`\n${labels[i]}:`)
  console.log(`  基频: ${r.f0Mean.toFixed(1)}Hz (预期 ~${expectedFreqs[i]}Hz) ${freqOk ? '✓' : '✗'}`)
  console.log(`  性别: ${r.gender} (预期 ${expectedGenders[i]}) ${genderOk ? '✓' : '✗'}`)
  console.log(`  共振峰: ${r.formants.length}个 ${formantsOk ? '✓' : '✗'}`)
  console.log(`  音调: ${r.estimatedPitch.toFixed(2)}x`)
  console.log(`  语速: ${r.estimatedSpeed.toFixed(2)}x`)
  console.log(`  综合: ${status}`)
}

console.log(`\n${'='.repeat(60)}`)
if (allPassed) {
  console.log('✓ 全部测试通过！本地离线语音克隆核心流水线工作正常。')
} else {
  console.log('⚠ 部分测试未通过，请检查上述详细输出。')
}
console.log(`${'='.repeat(60)}`)