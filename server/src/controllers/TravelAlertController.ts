import { DeleteWriteOpResultObject, InsertOneWriteOpResult , ObjectId } from 'mongodb';
import Database from '../database/database';
import { NotFoundError } from '../errors/NotFoundError';
import { ITravelAlert, IUser } from '../types';

/**
 * Travel controller
 */
class TravelAlertController {

  private readonly collectionAlerts: string;

  constructor() {
    this.collectionAlerts = 'alerts';
  }

  /**
   * Add a travelAlert to database
   */
  public async addTravelAlert(userId: string, travelAlert: ITravelAlert): Promise<string> {
    /**
     * check that user actually exists in db
     * (there is no foreign key constraint in mongo)
     */
    const user: IUser[] = await Database.find<IUser>('users', {
      _id: new ObjectId(userId),
    });
    if (user.length === 0) {
      throw new NotFoundError('user not found');
    }

    const insertOp: InsertOneWriteOpResult = await Database.insertOne(this.collectionAlerts, {
      userId: new ObjectId(userId),
      origin: travelAlert.origin,
      destination: travelAlert.destination,
      fromTime: new Date(travelAlert.fromTime),
      toTime: new Date(travelAlert.toTime),
      status: 'pending',
      lastCheck: new Date(),
    });

    return insertOp.insertedId.toString();
  }

  /**
   * Get one user travelAlert from database
   */
  public async getTravelAlert(userId: string, travelAlertId: string): Promise<ITravelAlert[]> {
    return Database.find<ITravelAlert>(this.collectionAlerts, {
      _id: new ObjectId(travelAlertId),
      userId: new ObjectId(userId),
    });
  }

  /**
   * Get all user travelAlerts from database
   */
  public async getAllTravelAlerts(userId: string): Promise<ITravelAlert[]> {
    return Database.find<ITravelAlert>(this.collectionAlerts, {
      userId: new ObjectId(userId),
    });
  }

  /**
   * Delete TravelAlert
   */
  public async deleteTravelAlert(userId: string, travelAlertId: string): Promise<number | undefined> {
    const deleteOp: DeleteWriteOpResultObject = await Database.deleteOne(this.collectionAlerts, {
      _id: new ObjectId(travelAlertId),
      userId: new ObjectId(userId),
    });

    return deleteOp.result.n;
  }
}

export default new TravelAlertController();
