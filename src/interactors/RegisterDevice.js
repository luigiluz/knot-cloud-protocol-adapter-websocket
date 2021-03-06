import _ from 'lodash';
import Joi from 'joi';
import throwError from './throwError';

class RegisterDevice {
  constructor(sessionStore, cloud, uuidAliasManager) {
    this.sessionStore = sessionStore;
    this.cloud = cloud;
    this.uuidAliasManager = uuidAliasManager;
  }

  async execute(requestId, properties) {
    const session = this.sessionStore.get(requestId);
    if (!session) {
      throwError('Unauthorized', 401);
    }

    const device = await this.createDevice(session, properties);
    const eventDevice = _.omit(device, 'token');
    await this.cloud.broadcastMessage(session.credentials, 'registered', eventDevice);
    return { type: 'registered', data: device };
  }

  async createDevice(session, properties) {
    const {
      id, type, name, active, isThingManager,
    } = properties;
    if (!type) {
      throwError('\'type\' is required', 400);
    }

    let device;

    switch (type) {
      case 'knot:app':
        device = await this.registerApp(session, { name, isThingManager });
        break;
      case 'knot:gateway':
        device = await this.registerGateway(session, { name, active });
        break;
      case 'knot:thing':
        device = await this.registerThing(session, id, { name });
        break;
      default:
        throwError('\'type\' should be \'knot:gateway\', \'knot:app\' or \'knot:thing\'', 400);
    }

    return _.pick(device, [
      'type',
      'metadata',
      'knot.active',
      'knot.isThingManager',
      'knot.gateways',
      'knot.id',
      'token',
    ]);
  }

  canCreateThings(device) {
    return this.isSessionOwnerUser(device)
    || this.isSessionOwnerGateway(device)
    || this.isThingManagerApp(device);
  }

  isSessionOwnerUser(authenticatedDevice) {
    return authenticatedDevice.type === 'knot:user';
  }

  isSessionOwnerGateway(authenticatedDevice) {
    return authenticatedDevice.type === 'knot:gateway';
  }

  isThingManagerApp(authenticatedDevice) {
    return authenticatedDevice.type === 'knot:app' && authenticatedDevice.knot.isThingManager;
  }

  async registerApp(session, options) {
    const user = await this.cloud.getDevice(session.credentials, session.credentials.uuid);
    if (!this.isSessionOwnerUser(user)) {
      throwError('Only users can create apps', 400);
    }

    const app = await this.createApp(user, options);
    await this.connectRouterToApp(session, user, app);
    await this.cloud.updateDevice(session.credentials, app.uuid, { 'knot.id': app.uuid });
    app.knot.id = app.uuid;

    return app;
  }

  async registerGateway(session, options) {
    const user = await this.cloud.getDevice(session.credentials, session.credentials.uuid);
    if (!this.isSessionOwnerUser(user)) {
      throwError('Only users can create gateways', 400);
    }

    const gateway = await this.createGateway(user, options);
    await this.connectRouterToGateway(session, user, gateway);
    await this.cloud.updateDevice(session.credentials, gateway.uuid, { 'knot.id': gateway.uuid });
    gateway.knot.id = gateway.uuid;

    return gateway;
  }

  async registerThing(session, id, options) {
    if (!id) {
      throwError('\'id\' is required', 400);
    }

    this.validateId(id);

    const device = await this.cloud.getDevice(session.credentials, session.credentials.uuid);

    if (!this.canCreateThings(device)) {
      throwError('Only users, gateways or allowed apps can create things', 400);
    }

    const devices = await this.cloud.getDevices(session.credentials, { 'knot.id': id });
    if (devices.length > 0) {
      throwError('Thing is already registered', 400);
    }

    const thing = await this.createThing(device, id, options);
    await this.connectRouterToThing(session, device, thing);
    await this.uuidAliasManager.create(
      session.credentials,
      id,
      thing.uuid,
    );

    return thing;
  }

  validateId(id) {
    const { error } = Joi.validate(id, Joi.string().length(16).hex().required());
    if (error) {
      const joiError = this.mapJoiError(error);
      throwError(`ID '${id}' invalid: ${joiError}`, 400);
    }
  }

  mapJoiError(error) {
    return `\n${_.chain(error.details).map(d => `- ${d.message}`).join('\n').value()}`;
  }

  async createApp(user, options) {
    return this.cloud.registerDevice({
      type: 'knot:app',
      metadata: {
        name: options.name,
      },
      knot: {
        router: user.knot.router,
        isThingManager: options.isThingManager || false,
      },
      meshblu: {
        version: '2.0.0',
        whitelists: {
          discover: {
            view: [
              { uuid: user.knot.router },
              { uuid: user.uuid },
            ],
          },
          configure: {
            update: [
              { uuid: user.knot.router },
              { uuid: user.uuid },
            ],
            sent: [{ uuid: user.knot.router }],
          },
          unregister: {
            sent: [{ uuid: user.knot.router }],
          },
        },
      },
    });
  }

  async createGateway(user, options) {
    return this.cloud.registerDevice({
      type: 'knot:gateway',
      metadata: {
        name: options.name,
      },
      knot: {
        user: user.uuid,
        router: user.knot.router,
        active: options.active || false,
      },
      meshblu: {
        version: '2.0.0',
        whitelists: {
          discover: {
            view: [
              { uuid: user.knot.router },
              { uuid: user.uuid },
            ],
          },
          configure: {
            update: [
              { uuid: user.knot.router },
              { uuid: user.uuid },
            ],
            sent: [{ uuid: user.knot.router }],
          },
          broadcast: {
            sent: [{ uuid: user.knot.router }],
          },
          unregister: {
            sent: [{ uuid: user.knot.router }],
          },
        },
      },
    });
  }

  async createThing(device, id, options) {
    const params = {
      type: 'knot:thing',
      metadata: {
        name: options.name,
      },
      knot: {
        id,
        gateways: [],
      },
      meshblu: {
        version: '2.0.0',
        whitelists: {
          discover: {
            view: [
              { uuid: device.knot.router },
              { uuid: device.uuid },
            ],
          },
          configure: {
            update: [
              { uuid: device.knot.router },
              { uuid: device.uuid },
            ],
            sent: [{ uuid: device.knot.router }],
          },
          broadcast: {
            sent: [{ uuid: device.knot.router }],
          },
          message: {
            from: [{ uuid: device.knot.router }],
          },
          unregister: {
            sent: [{ uuid: device.knot.router }],
          },
        },
      },
    };

    if (device.type === 'knot:gateway') {
      params.knot.gateways.push(device.uuid);
      params.meshblu.whitelists.discover.view.push({ uuid: device.knot.user });
      params.meshblu.whitelists.configure.update.push({ uuid: device.knot.user });
    }

    return this.cloud.registerDevice(params);
  }

  async connectRouterToApp(session, user, app) {
    if (app.knot.isThingManager) {
      await this.givePermission(session, user.knot.router, app.uuid, 'configure.update');
    }

    await this.givePermission(session, user.knot.router, app.uuid, 'broadcast.received');
    await this.givePermission(session, user.knot.router, app.uuid, 'unregister.received');
    await this.givePermission(session, user.knot.router, app.uuid, 'configure.received');

    await this.subscribeOwn(session, app.uuid, 'broadcast.received');
    await this.subscribeOwn(session, app.uuid, 'unregister.received');
    await this.subscribe(session, user.knot.router, app.uuid, 'broadcast.received');
    await this.subscribe(session, user.knot.router, app.uuid, 'unregister.received');
    await this.subscribe(session, app.uuid, user.knot.router, 'unregister.sent');

    await this.givePermission(session, user.knot.router, app.uuid, 'message.as');
    await this.givePermission(session, user.knot.router, app.uuid, 'discover.as');
    await this.givePermission(session, user.knot.router, app.uuid, 'configure.as');
  }

  async connectRouterToGateway(session, user, gateway) {
    await this.givePermission(session, user.knot.router, gateway.uuid, 'configure.update');

    await this.subscribeOwn(session, gateway.uuid, 'broadcast.received');
    await this.subscribe(session, user.knot.router, gateway.uuid, 'unregister.received');
    await this.subscribe(session, gateway.uuid, user.knot.router, 'broadcast.sent');
    await this.subscribe(session, gateway.uuid, user.knot.router, 'unregister.sent');
  }

  async connectRouterToThing(session, device, thing) {
    await this.subscribeOwn({ credentials: { uuid: thing.uuid, token: thing.token } }, thing.uuid, 'message.received');
    await this.subscribe(session, thing.uuid, device.knot.router, 'broadcast.sent');
    await this.subscribe(session, thing.uuid, device.knot.router, 'unregister.sent');
  }

  async subscribe(session, from, to, type) {
    await this.cloud.createSubscription(session.credentials, {
      subscriberUuid: to,
      emitterUuid: from,
      type,
    });
  }

  async subscribeOwn(session, uuid, type) {
    await this.subscribe(session, uuid, uuid, type);
  }

  async givePermission(session, from, to, type) {
    const device = await this.cloud.getDevice(session.credentials, from);
    this.pushToWhitelist(device, type, to);
    await this.cloud.updateDevice(session.credentials, device.uuid, { meshblu: device.meshblu });
  }

  pushToWhitelist(device, type, uuid) {
    _.chain(device)
      .defaultsDeep({ meshblu: { whitelists: this.pathToObject(type) } })
      .get(`meshblu.whitelists.${type}`)
      .value()
      .push({ uuid });
  }

  pathToObject(path) {
    /* eslint-disable no-multi-spaces */
    return _.chain(path)                                // 'broadcast.received'
      .toPath()                                         // ['broadcast', 'received']
      .reverse()                                        // ['received', 'broadcast']
      .reduce((acc, step) => _.set({}, step, acc), [])  // { broadcast: { received: [] }}
      .value();
    /* eslint-enable no-multi-spaces */
  }
}

export default RegisterDevice;
