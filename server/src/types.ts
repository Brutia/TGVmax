import { ObjectId } from 'mongodb';

/**
 * SNCF Train interface
 */
export interface ITrain {
  departureDate: string;
  arrivalDate: string;
  minPrice: number;
}

/**
 * SNCF raw journey 
 */
export interface ISncfRawJourney {
  status:{
    isBookable:boolean
  }
  travelId: string;
  bestPriceLabel: string;
}

/**
 * Trainline raw journey
 */
export interface ITrainlineRawJourney {
  departAt: string,
  sections: string []
}

export interface ITrainlineSection {
  id: string,
  alternatives: string []
}

export interface ITrainlineAlternative {
  id: string,
  price: {amount: number}
}

/**
 * Journey
 */
 export interface IJourney {
  departureDate: string;
  price: number;
}

/**
 * Availability interface
 */
export interface IAvailability {
  isTgvmaxAvailable: boolean;
  hours: string[];
}

/**
 * User interface
 */
export interface IUser {
  _id: ObjectId;
  email: string;
  password: string;
  tgvmaxNumber: string;
}

/**
 * TravelAlert interface
 */
export interface ITravelAlert {
  _id: ObjectId;
  userId: string;
  tgvmaxNumber: string;
  origin: {
    name: string;
    sncfId: string;
    trainlineId: string;
  };
  destination: {
    name: string;
    sncfId: string;
    trainlineId: string;
  };
  fromTime: Date;
  toTime: Date;
  status: string;
  lastCheck: Date;
  createdAt: Date;
}

/**
 * Train station interface
 */
export interface IStation {
  _id?: string;
  name: string;
  sncfId: string;
  trainlineId: string;
}

export interface IConnector {
  name: string;
  isTgvmaxAvailable: any; // tslint:disable-line
}

export interface IConnectorParams {
  origin: {
    name: string;
    sncfId: string;
    trainlineId: string;
  };
  destination: {
    name: string;
    sncfId: string;
    trainlineId: string;
  };
  fromTime: string;
  toTime: string;
  tgvmaxNumber: string;
}
