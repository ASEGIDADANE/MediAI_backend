import {
  ConditionCategory,
  MedicalSpecialty,
} from '../generated/prisma/client';
import {
  CONDITION_CATEGORY_LABELS,
  CONDITION_TO_SPECIALTIES,
  inferMedicalSpecialty,
  MEDICAL_SPECIALTY_LABELS,
  specialtiesForConditions,
  specialtyToConditions,
} from './consultation-matching.constants';

describe('consultation-matching.constants', () => {
  describe('CONDITION_TO_SPECIALTIES', () => {
    it('covers every ConditionCategory enum value', () => {
      const all = Object.values(ConditionCategory);
      for (const cat of all) {
        const specs = CONDITION_TO_SPECIALTIES[cat];
        expect(Array.isArray(specs)).toBe(true);
        expect(specs.length).toBeGreaterThan(0);
      }
    });

    it('only maps to specialties that exist on the MedicalSpecialty enum', () => {
      const validSpecialties = new Set<string>(
        Object.values(MedicalSpecialty),
      );
      for (const cat of Object.values(ConditionCategory)) {
        for (const sp of CONDITION_TO_SPECIALTIES[cat]) {
          expect(validSpecialties.has(sp)).toBe(true);
        }
      }
    });

    it('uses general_practice / internal_medicine for general buckets', () => {
      expect(CONDITION_TO_SPECIALTIES.general_wellness).toContain(
        MedicalSpecialty.general_practice,
      );
      expect(CONDITION_TO_SPECIALTIES.other).toContain(
        MedicalSpecialty.general_practice,
      );
    });
  });

  describe('specialtiesForConditions', () => {
    it('returns null when no conditions are passed', () => {
      expect(specialtiesForConditions(null)).toBeNull();
      expect(specialtiesForConditions(undefined)).toBeNull();
      expect(specialtiesForConditions([])).toBeNull();
    });

    it('expands a single condition into its mapped specialties', () => {
      const out = specialtiesForConditions([ConditionCategory.heart_circulation]);
      expect(out).toEqual(
        expect.arrayContaining([
          MedicalSpecialty.cardiology,
          MedicalSpecialty.internal_medicine,
        ]),
      );
    });

    it('de-duplicates across multiple conditions', () => {
      // both buckets pull internal_medicine — it must appear exactly once
      const out = specialtiesForConditions([
        ConditionCategory.heart_circulation,
        ConditionCategory.allergies,
      ])!;
      const count = out.filter(
        (s) => s === MedicalSpecialty.internal_medicine,
      ).length;
      expect(count).toBe(1);
    });
  });

  describe('specialtyToConditions', () => {
    it('returns the categories that surface a given specialty', () => {
      const out = specialtyToConditions(MedicalSpecialty.cardiology);
      expect(out).toContain(ConditionCategory.heart_circulation);
    });

    it('returns an empty array for specialties no category currently uses', () => {
      // None of the current categories map to plastic_surgery — confirms the
      // reverse lookup defaults sanely.
      const out = specialtyToConditions(MedicalSpecialty.plastic_surgery);
      expect(out).toEqual([]);
    });
  });

  describe('inferMedicalSpecialty', () => {
    it('returns null for empty / whitespace input', () => {
      expect(inferMedicalSpecialty(null)).toBeNull();
      expect(inferMedicalSpecialty(undefined)).toBeNull();
      expect(inferMedicalSpecialty('   ')).toBeNull();
    });

    it('maps common human-readable labels case-insensitively', () => {
      expect(inferMedicalSpecialty('Cardiology')).toBe(
        MedicalSpecialty.cardiology,
      );
      expect(inferMedicalSpecialty('OB/GYN')).toBe(
        MedicalSpecialty.gynecology_obstetrics,
      );
      expect(inferMedicalSpecialty('  Family Medicine  ')).toBe(
        MedicalSpecialty.general_practice,
      );
      expect(inferMedicalSpecialty('Pediatrician')).toBe(
        MedicalSpecialty.pediatrics,
      );
    });

    it('returns null for free text it does not recognise', () => {
      expect(inferMedicalSpecialty('Aurologist of Atlantis')).toBeNull();
    });
  });

  describe('label maps', () => {
    it('have a label for every condition category', () => {
      for (const cat of Object.values(ConditionCategory)) {
        expect(CONDITION_CATEGORY_LABELS[cat]).toBeDefined();
        expect(CONDITION_CATEGORY_LABELS[cat].length).toBeGreaterThan(0);
      }
    });

    it('have a label for every medical specialty', () => {
      for (const sp of Object.values(MedicalSpecialty)) {
        expect(MEDICAL_SPECIALTY_LABELS[sp]).toBeDefined();
        expect(MEDICAL_SPECIALTY_LABELS[sp].length).toBeGreaterThan(0);
      }
    });
  });
});
