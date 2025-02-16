import { isEmpty } from 'lodash';
import * as moment from 'moment-timezone';
import { ObjectId } from 'mongodb';
import * as cron from 'node-cron';
import Config from '../Config';
import Notification from '../core/Notification';
import Database from '../database/database';
import { IAvailability, IConnector, IConnectorParams, ITravelAlert, IUser } from '../types';
import Sncf from './connectors/Sncf';
import Trainline from './connectors/Trainline';

/**
 * Periodically check Tgvmax availability
 * How does it work ?
 * 1/ every x min (let's say 30min) a cronjob will fetch travelAlerts with status: 'pending' in db
 * 2/ for each travelAlert, check if a tgvmax seat is available
 * 3/ if YES -> update status to 'triggered' and send notification
 *    if NO  -> update lastCheck to current time and continue
 */
class CronChecks {

  /**
   * connectors
   */
  private readonly connectors: IConnector[];

  constructor() {
    this.connectors = [
      {
        name: 'Trainline',
        async isTgvmaxAvailable({
          origin, destination, fromTime, toTime, tgvmaxNumber,
        }: IConnectorParams): Promise<IAvailability> {
          console.log(`${moment(new Date()).tz('Europe/Paris').format('DD-MM-YYYY HH:mm:ss')} - using trainline connector`); // tslint:disable-line

          return Trainline.isTgvmaxAvailable({ origin, destination, fromTime, toTime, tgvmaxNumber });
        },
      },
      {
        name: 'Sncf',
        async isTgvmaxAvailable({
          origin, destination, fromTime, toTime, tgvmaxNumber,
        }: IConnectorParams): Promise<IAvailability> {
          console.log(`${moment(new Date()).tz('Europe/Paris').format('DD-MM-YYYY HH:mm:ss')} - using sncf connector`); // tslint:disable-line

          return Sncf.isTgvmaxAvailable({ origin, destination, fromTime, toTime, tgvmaxNumber });
        },
      },
    ];
  }

  /**
   * init CronJob
   */
  public readonly init = (schedule: string): void => {
    cron.schedule(schedule, async() => {
      try {
        const travelAlerts: ITravelAlert[] = await this.fetchPendingTravelAlerts();
        if (isEmpty(travelAlerts) || Config.disableCronCheck) {
          return;
        }

        console.log(`${moment(new Date()).tz('Europe/Paris').format('DD-MM-YYYY HH:mm:ss')} - processing ${travelAlerts.length} travelAlerts`); // tslint:disable-line
        /**
         * Process each travelAlert
         * Send notification if tgvmax seat is available
         */
        for (const travelAlert of travelAlerts) {
          
          for (const connector of this.connectors){
            var availability = await connector.isTgvmaxAvailable({ // tslint:disable-line
              origin: travelAlert.origin,
              destination: travelAlert.destination,
              fromTime: travelAlert.fromTime,
              toTime: travelAlert.toTime,
              tgvmaxNumber: travelAlert.tgvmaxNumber,
            });
            if(!availability.isTgvmaxAvailable){
              continue; // if no TGVmax seat is found, we try another connector
            }

            /**
             * if is TGVmax is available : send email
             */
            console.log(`${moment(new Date()).tz('Europe/Paris').format('DD-MM-YYYY HH:mm:ss')} - travelAlert ${travelAlert._id} triggered`); // tslint:disable-line
            const email: string = await this.fetchEmailAddress(travelAlert.userId);
            await Notification.sendEmail(
              email,
              travelAlert.origin.name,
              travelAlert.destination.name,
              travelAlert.fromTime,
              availability.hours,
            );
            /**
             * update travelALert status
             */
            await Database.updateOne('alerts', { _id: new ObjectId(travelAlert._id) }, {
              $set: { status: 'triggered', triggeredAt: new Date() },
            },
            );
            await this.delay(Config.delay);
            break;
          }

          if (!availability.isTgvmaxAvailable) {
            await Database.updateOne(
              'alerts', { _id: new ObjectId(travelAlert._id)}, { $set: { lastCheck: new Date() },
            });
            await this.delay(Config.delay);
            continue;
          }
        }
      } catch (err) {
        console.log(err); // tslint:disable-line
      }
    });
  }

  /**
   * fetch all pending travelAlert in database
   */
  private readonly fetchPendingTravelAlerts = async(): Promise<ITravelAlert[]> => {
    const TGVMAX_BOOKING_RANGE: number = 30;
    return Database.find<ITravelAlert>('alerts', {
      status: 'pending',
      fromTime: {
        $gt: new Date(),
        $lt: moment(new Date()).add(TGVMAX_BOOKING_RANGE, 'days').endOf('day').toDate(),
      },
    });
  }

  /**
   * fetch all pending travelAlert in database
   */
  private readonly fetchEmailAddress = async(userId: string): Promise<string> => {
    const user: IUser[] = await Database.find<IUser>('users', {
      _id: new ObjectId(userId),
    });

    return user[0].email;
  }

  /**
   * delay function
   */
  private readonly delay = async(ms: number): Promise<void> => {
    type IResolve = (value?: void | PromiseLike<void> | undefined) => void;

    return new Promise((resolve: IResolve): NodeJS.Timeout => setTimeout(resolve, ms));
  }
}

export default new CronChecks();
