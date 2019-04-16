import * as bodyParser from 'body-parser';
import * as express from 'express';
import * as helmet from 'helmet';

import { ImageRouter } from './routes/image-router';
import { SessionRouter } from './routes/session-router';
import { UploadRouter } from './routes/upload-router';
import { UserRouter } from './routes/user-router';
import { AuthService } from './services/auth-service';
import { DBClient } from './services/db-client';
import { ImageService } from './services/image-service';
import { UserService } from './services/user-service';

export class Server {

    app: express.Application;

    private routers = {};
    private imageService: ImageService;
    private userService: UserService;

    constructor(private port: number, private apiRoot: string,
        private imageDir: string, private dbClient: DBClient) {
        this.app = express();
        this.imageService = new ImageService(dbClient);
        this.userService = new UserService(dbClient);
        this.configure();
        this.start();
    }

    // Configure Express middleware
    private configure() {
        this.configureLogger();
        this.configureBodyParser();
        this.app.use(helmet());
        this.configureRoutes();
        this.connectRoutes();
        this.configureStatic();
    }

    private configureBodyParser() {
        this.app.use(bodyParser.urlencoded({extended: true}));
    }

    private configureLogger() {
        this.app.use((req, res, next) => {
            console.log(`[${process.env.NODE_ENV}] REQUST ${req.method} ${req.url}`);
            next();
        });
    }

    private configureStatic() {
        this.app.use(`/${this.apiRoot}/uploads`, express.static(this.imageDir));
    }

    private authChecker(req, res, next) {
        // If this is a login request, create a user request or
        // get an image request, don't check for token
        if (req.method === 'OPTIONS' || (req.method === 'POST' &&
        (req.path.indexOf('/sessions') !== -1 || req.path.indexOf('/users') !== -1)) ||
        (req.method === 'GET' && req.path.indexOf('/uploads') !== -1)) {
            console.log('authChecker request without validation');
            return next();
        }

        let token = req.body.token || req.query.token || req.headers['x-access-token'];

        // decode token
        if (token) {
            // verifies secret and checks exp
            AuthService.getInstance().validateToken(token).then((result) => {
                console.log('authChecker token valid');
                req.user = result;
                next();
            }).catch((error) => {
                console.log('authChecker token invalid');
                return res.status(401).send({
                    error: 'Failed to authenticate token.',
                });
            });
        } else {
            console.log('authChecker token undefined');
            // if there is no token
            // return an error
            return res.status(401).send({
                error: 'No token provided.',
            });
        }
    }

    // Create API routers
    private configureRoutes() {
        let sessionRouter = new SessionRouter(this.dbClient);
        this.routers['sessions'] = sessionRouter;

        let userRouter = new UserRouter(this.dbClient, this.userService, this.imageService);
        this.routers['users'] = userRouter;

        let imageRouter = new ImageRouter(this.dbClient, this.imageService);
        this.routers['images'] = imageRouter;

        let uploadRouter = new UploadRouter(this.imageDir);
        this.routers['upload'] = uploadRouter;
    }

    // Configure API endpoints
    private connectRoutes() {
        let apiRoot = this.apiRoot;

        this.app.use(this.authChecker);

        // Create and map express routers
        for (let key in this.routers) {
            if (this.routers.hasOwnProperty(key)) {
                let value = this.routers[key];
                this.app.use(`/${apiRoot}/${key}`, value.router);
            }
        }
    }

    // Connect to database and start listening to port
    private start() {
        this.app.listen(this.port, () => {
            console.log('We are live on ' + this.port);
        });
    }

}
