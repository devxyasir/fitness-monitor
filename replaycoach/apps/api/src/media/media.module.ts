import { forwardRef, Module } from '@nestjs/common';
import { LiveKitService } from './livekit.service';
import { EgressService } from './egress.service';
import { EgressWebhookController } from './egress-webhook.controller';
import { CloudFrontSigner } from './cloudfront-signer';
import { RecordingsModule } from '../recordings/recordings.module';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [RecordingsModule, forwardRef(() => SessionsModule)],
  controllers: [EgressWebhookController],
  providers: [LiveKitService, EgressService, CloudFrontSigner],
  exports: [LiveKitService, EgressService, CloudFrontSigner],
})
export class MediaModule {}
