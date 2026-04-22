import { Injectable } from '@nestjs/common';
import { getAiDoctorConfigSnapshot } from '../config/ai-doctor.snapshot';

@Injectable()
export class AiDoctorConfigService {
  getConfig() {
    return getAiDoctorConfigSnapshot();
  }
}
