/**
 * FFmpeg Processing Service
 * Handles video and audio metadata extraction and thumbnail generation
 */

import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import Ffmpeg from 'fluent-ffmpeg';
import { s3Service } from '../../shared/lib/s3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Set ffmpeg path
Ffmpeg.setFfmpegPath(ffmpegInstaller.path);

interface VideoMetadata {
  duration: number; // in seconds
  width: number;
  height: number;
  codec?: string;
  fps?: number;
}

interface AudioMetadata {
  duration: number; // in seconds
  codec?: string;
  bitrate?: number;
  sampleRate?: number;
}

export class FFmpegService {
  /**
   * Extract video metadata
   */
  async extractVideoMetadata(buffer: Buffer): Promise<VideoMetadata> {
    // Create temporary file
    const tempInputPath = path.join(os.tmpdir(), `video-input-${Date.now()}.tmp`);
    
    try {
      // Write buffer to temp file
      fs.writeFileSync(tempInputPath, buffer);

      return await new Promise((resolve, reject) => {
        Ffmpeg.ffprobe(tempInputPath, (err: any, metadata: any) => {
          if (err) {
            reject(new Error(`Failed to extract video metadata: ${err.message}`));
            return;
          }

          const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
          
          if (!videoStream) {
            reject(new Error('No video stream found'));
            return;
          }

          const duration = metadata.format.duration || 0;
          const width = videoStream.width || 0;
          const height = videoStream.height || 0;
          const codec = videoStream.codec_name;
          const fps = this.parseFps(videoStream.r_frame_rate);

          resolve({
            duration: Math.round(duration),
            width,
            height,
            codec,
            fps
          });
        });
      });
    } finally {
      // Cleanup temp file
      try {
        fs.unlinkSync(tempInputPath);
      } catch (e) {
        console.warn('Failed to cleanup temp file:', tempInputPath);
      }
    }
  }

  /**
   * Generate video thumbnail
   */
  async generateVideoThumbnail(buffer: Buffer, timestamp: string = '00:00:01'): Promise<Buffer> {
    const tempInputPath = path.join(os.tmpdir(), `video-input-${Date.now()}.tmp`);
    const tempOutputPath = path.join(os.tmpdir(), `thumbnail-${Date.now()}.jpg`);

    try {
      // Write buffer to temp file
      fs.writeFileSync(tempInputPath, buffer);

      return await new Promise((resolve, reject) => {
        Ffmpeg(tempInputPath)
          .screenshots({
            timestamps: [timestamp],
            filename: path.basename(tempOutputPath),
            folder: path.dirname(tempOutputPath),
            size: '640x?'
          })
          .on('end', () => {
            try {
              const thumbnailBuffer = fs.readFileSync(tempOutputPath);
              resolve(thumbnailBuffer);
            } catch (e) {
              reject(new Error('Failed to read generated thumbnail'));
            }
          })
          .on('error', (err: any) => {
            reject(new Error(`Failed to generate thumbnail: ${err.message}`));
          });
      });
    } finally {
      // Cleanup temp files
      try {
        fs.unlinkSync(tempInputPath);
      } catch (e) {
        console.warn('Failed to cleanup input file:', tempInputPath);
      }
      try {
        fs.unlinkSync(tempOutputPath);
      } catch (e) {
        // May not exist if generation failed
      }
    }
  }

  /**
   * Extract audio metadata
   */
  async extractAudioMetadata(buffer: Buffer): Promise<AudioMetadata> {
    const tempInputPath = path.join(os.tmpdir(), `audio-input-${Date.now()}.tmp`);

    try {
      // Write buffer to temp file
      fs.writeFileSync(tempInputPath, buffer);

      return await new Promise((resolve, reject) => {
        Ffmpeg.ffprobe(tempInputPath, (err: any, metadata: any) => {
          if (err) {
            reject(new Error(`Failed to extract audio metadata: ${err.message}`));
            return;
          }

          const audioStream = metadata.streams.find((s: any) => s.codec_type === 'audio');
          
          if (!audioStream) {
            reject(new Error('No audio stream found'));
            return;
          }

          const duration = metadata.format.duration || 0;
          const codec = audioStream.codec_name;
          const bitrate = parseInt(audioStream.bit_rate || '0');
          const sampleRate = audioStream.sample_rate;

          resolve({
            duration: Math.round(duration),
            codec,
            bitrate,
            sampleRate
          });
        });
      });
    } finally {
      // Cleanup temp file
      try {
        fs.unlinkSync(tempInputPath);
      } catch (e) {
        console.warn('Failed to cleanup temp file:', tempInputPath);
      }
    }
  }

  /**
   * Parse frame rate string (e.g., "30/1" -> 30)
   */
  private parseFps(fpsString?: string): number {
    if (!fpsString) return 0;
    
    const parts = fpsString.split('/');
    if (parts.length === 2) {
      const numerator = parseFloat(parts[0] ?? '0');
      const denominator = parseFloat(parts[1] ?? '1');
      return Math.round(numerator / denominator);
    }
    
    return parseFloat(fpsString) || 0;
  }
}

export const ffmpegService = new FFmpegService();
