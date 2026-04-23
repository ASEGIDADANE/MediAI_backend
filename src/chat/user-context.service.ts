import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, UserProfile } from '../generated/prisma/client';

@Injectable()
export class UserContextService {
  private readonly maxChars: number;

  constructor(private readonly config: ConfigService) {
    this.maxChars = Number(
      this.config.get<string>('USER_CONTEXT_MAX_CHARS', '4000') || 4000,
    );
  }

  /**
   * Summarizes DB profile + medicalHistory JSON to a bounded plain-text block for the LLM.
   * Never pass raw 100KB blobs.
   */
  buildFromUserProfile(p: UserProfile): string {
    const lines: string[] = [
      '--- User context (from our records only) ---',
      `Preferred name: ${p.preferredName}`,
      `Region: ${p.region}`,
      `Age (years): ${p.ageYears}`,
      `Sex at birth: ${p.sexAtBirth}`,
      `Measurement: ${p.measurementSystem}, weight: ${p.weight}, height: ft/in/cm = ${p.heightFeet ?? ''} / ${p.heightInches ?? ''} / ${p.heightCm ?? ''}`,
    ];
    if (p.professionalProfile && typeof p.professionalProfile === 'object') {
      const prof = p.professionalProfile as Record<string, unknown>;
      for (const key of [
        'title',
        'specialty',
        'region',
        'allergies',
        'medicationsHistory',
        'chronicDiseases',
      ] as const) {
        if (prof[key] != null && String(prof[key]).trim() !== '') {
          lines.push(`${key}: ${String(prof[key]).slice(0, 400)}`);
        }
      }
    }
    const med = this.summarizeMedicalJson(p.medicalHistory);
    if (med) {
      lines.push('--- Medical & lifestyle questionnaire (self-reported) ---');
      lines.push(med);
    }
    let out = lines.join('\n');
    if (out.length > this.maxChars) {
      out = out.slice(0, this.maxChars) + '\n[truncated]';
    }
    return out;
  }

  private summarizeMedicalJson(
    raw: Prisma.JsonValue | null,
  ): string {
    if (raw === null || raw === undefined) {
      return '';
    }
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      return '';
    }
    const o = raw as Record<string, unknown>;
    const parts: string[] = [];
    const add = (label: string, val: unknown) => {
      if (val == null) return;
      if (Array.isArray(val) && val.length) {
        parts.push(`${label}: ${val.map(String).join(', ').slice(0, 800)}`);
        return;
      }
      if (typeof val === 'string' && val.trim()) {
        parts.push(`${label}: ${val.trim().slice(0, 1200)}`);
      }
    };
    add('chronicDiseases', o.chronicDiseases);
    add('chronicDetails', o.chronicDetails);
    add('allergies', o.allergies);
    add('allergyDetails', o.allergyDetails);
    add('currentMedications', o.currentMedications);
    add('pastMedications', o.pastMedications);
    add('smokingIntensity', o.smokingIntensity);
    add('alcoholIntake', o.alcoholIntake);
    add('dietaryHabits', o.dietaryHabits);
    add('activityLevel', o.activityLevel);
    add('sleepPattern', o.sleepPattern);
    add('stressLevel', o.stressLevel);
    return parts.join('\n');
  }
}
