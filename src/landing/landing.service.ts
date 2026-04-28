import { Injectable } from '@nestjs/common';
import { getLandingConfigSnapshot } from '../config/landing.snapshot';

@Injectable()
export class LandingService {
  getLanding() {
    return getLandingConfigSnapshot();
  }
}
