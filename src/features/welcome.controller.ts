import {
  BaseHttpController,
  controller,
  httpGet,
} from 'inversify-express-utils';

@controller('/')
export class WelcomeController extends BaseHttpController {
  @httpGet('/')
  async index() {
    return {
      httpCode: 200,
      data: null,
    };
  }
}
