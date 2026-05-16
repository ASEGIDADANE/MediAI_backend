import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConsultationBookingStatus,
  ConsultationType,
  OnboardingUserRole,
  ProfessionalVerificationStatus,
  UserAppRole,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConsultationBookingListResponseDto,
  ConsultationBookingResponseDto,
  CreateConsultationBookingDto,
} from './dto/consultations.dto';
import { formatPaymentPrice } from '../payments/payment-format.util';
import { readConsultationFeeMajorFromProfile } from './consultation-profile-fees.util';

@Injectable()
export class ConsultationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createBooking(
    userId: string,
    appRole: UserAppRole,
    dto: CreateConsultationBookingDto,
  ): Promise<ConsultationBookingResponseDto> {
    if (appRole !== UserAppRole.user) {
      throw new ForbiddenException(
        'Only signed-in patient accounts can create a consultation booking.',
      );
    }

    const patientProfile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { role: true },
    });
    if (!patientProfile || patientProfile.role !== OnboardingUserRole.personal) {
      throw new ForbiddenException(
        'Only personal patient accounts can create consultation bookings.',
      );
    }

    const doctor = await this.prisma.userProfile.findFirst({
      where: {
        userId: dto.topDoctorId,
        role: OnboardingUserRole.professional,
        verificationStatus: ProfessionalVerificationStatus.verified,
      },
      select: {
        userId: true,
        preferredName: true,
        professionalProfile: true,
      },
    });
    if (!doctor) {
      throw new NotFoundException('Doctor not found.');
    }

    const feeMajor = readConsultationFeeMajorFromProfile(
      doctor.professionalProfile,
      dto.consultationType,
    );
    if (feeMajor <= 0) {
      const kind =
        dto.consultationType === ConsultationType.video ? 'video' : 'written';
      throw new BadRequestException(
        `This doctor has not set a positive ${kind} consultation fee (ETB) on their public profile, so paid checkout is disabled. They can add fees under Dashboard → Doctor verification → Edit profile (?edit=1).`,
      );
    }

    const currency =
      this.config.get<string>('CHAPA_CURRENCY')?.toUpperCase() ?? 'ETB';
    const consultationFeeCents = Math.round(feeMajor * 100);
    const booking = await this.prisma.consultationBooking.create({
      data: {
        patientUserId: userId,
        topDoctorId: dto.topDoctorId,
        consultationType: dto.consultationType,
        status: ConsultationBookingStatus.pending_payment,
        consultationFeeCents,
        currency,
        patientNotes: dto.patientNotes?.trim() || null,
      },
      include: {
        topDoctor: {
          select: {
            email: true,
            profile: {
              select: {
                preferredName: true,
                professionalProfile: true,
              },
            },
          },
        },
      },
    });

    return toConsultationBookingDto(booking);
  }

  async listMyBookings(userId: string): Promise<ConsultationBookingListResponseDto> {
    const rows = await this.prisma.consultationBooking.findMany({
      where: { patientUserId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        topDoctor: {
          select: {
            email: true,
            profile: {
              select: {
                preferredName: true,
                professionalProfile: true,
              },
            },
          },
        },
      },
    });
    return { items: rows.map(toConsultationBookingDto) };
  }

  async getBookingById(
    userId: string,
    appRole: UserAppRole,
    bookingId: string,
  ): Promise<ConsultationBookingResponseDto> {
    const row = await this.prisma.consultationBooking.findUnique({
      where: { id: bookingId },
      include: {
        topDoctor: {
          select: {
            email: true,
            profile: {
              select: {
                preferredName: true,
                professionalProfile: true,
              },
            },
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Consultation booking not found.');
    }
    if (appRole !== UserAppRole.admin && row.patientUserId !== userId) {
      throw new ForbiddenException('This consultation booking is not yours.');
    }
    return toConsultationBookingDto(row);
  }
}

function toConsultationBookingDto(row: {
  id: string;
  topDoctorId: string;
  consultationType: ConsultationType;
  status: ConsultationBookingStatus;
  consultationFeeCents: number;
  currency: string;
  patientNotes: string | null;
  paidAt: Date | null;
  chapaTxRef: string | null;
  createdAt: Date;
  updatedAt: Date;
  topDoctor: {
    email: string;
    profile: {
      preferredName: string;
      professionalProfile: unknown;
    } | null;
  };
}): ConsultationBookingResponseDto {
  return {
    id: row.id,
    topDoctorId: row.topDoctorId,
    topDoctorName: resolveDoctorName(row.topDoctor),
    consultationType: row.consultationType,
    status: row.status,
    consultationFeeCents: row.consultationFeeCents,
    consultationFeeDisplay: formatPaymentPrice(
      row.consultationFeeCents,
      row.currency,
    ),
    currency: row.currency,
    patientNotes: row.patientNotes,
    paidAt: row.paidAt?.toISOString() ?? null,
    chapaTxRef: row.chapaTxRef,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function resolveDoctorName(doctor: {
  email: string;
  profile: {
    preferredName: string;
    professionalProfile: unknown;
  } | null;
}): string {
  const fullName = readString(doctor.profile?.professionalProfile, 'fullName');
  return fullName ?? doctor.profile?.preferredName ?? doctor.email;
}

function readString(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const next = (value as Record<string, unknown>)[key];
  return typeof next === 'string' && next.trim() !== '' ? next.trim() : null;
}
