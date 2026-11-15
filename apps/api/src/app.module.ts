import { Controller, Get, Module } from '@nestjs/common';
import { demoSession } from './demo';

@Controller()
class AppController {
  @Get('health') health() { return { status: 'ok', service: 'audio-app-api' }; }
  @Get('demo') demo() { return demoSession; }
}

@Module({ controllers: [AppController] })
export class AppModule {}
