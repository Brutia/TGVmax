import Axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { filter, get, isEmpty, isNil, map, uniq } from 'lodash';
import * as moment from 'moment-timezone';
import { randomUUID } from 'crypto'
import Config from '../../Config';
import { IAvailability, IConnectorParams, ISncfRawJourney, IJourney} from '../../types';

/**
 * Sncf connector
 */
class Sncf {
  /**
   * connector generic function
   */
  public async isTgvmaxAvailable({
    origin, destination, fromTime, toTime, tgvmaxNumber,
  }: IConnectorParams): Promise<IAvailability> {
    const tgvmaxHours: string[] = await this.getTgvmaxHours({
      origin, destination, fromTime, toTime, tgvmaxNumber,
    });

    /**
     * If previous call returns an empty array, there is no TGVmax available
     */
    return isEmpty(tgvmaxHours)
      ? { isTgvmaxAvailable: false, hours: [] }
      : { isTgvmaxAvailable: true, hours: uniq(tgvmaxHours) };
  }

  /**
   * get data from sncf api
   */
  private readonly getTgvmaxHours = async({
    origin, destination, fromTime, toTime, tgvmaxNumber,
  }: IConnectorParams): Promise<string[]> => {
    const results: IJourney[] = [];
    let keepSearching: boolean = true;
    let departureMinTime: string = moment(fromTime).tz('Europe/Paris').format('YYYY-MM-DD[T]HH:mm:ss');
    const departureMaxTime: string = moment(toTime).tz('Europe/Paris').format('YYYY-MM-DD[T]HH:mm:ss');
    try {
      while (keepSearching) {
        
        var cookies: string[] | undefined = await Axios.request({
          method: "get",
          url: Config.baseSncfUrl,
          headers: Config.baseHeaders,
        }).then(function(response: AxiosResponse): string[] | undefined{
          return response.headers['set-cookie'];
        });
        var cookiesString: string = "";
        if(!isNil(cookies)){
          for(var i = 0; i < cookies.length;i++){
            cookies[i] = cookies[i].split(";")[0]
          }
          cookiesString = cookies.join(";");
        }

        var data: string = JSON.stringify({
          "schedule": {
            "outward": {
              "date": departureMinTime+".000Z"
            }
          },
          "mainJourney": {
            "origin": {
              "label": origin.name,
              "id": origin.sncfId
            },
            "destination": {
              "label": destination.name,
              "id": destination.sncfId
            }
          },
          "passengers": [
            {
              "discountCards": [{"code":"HAPPY_CARD","number":tgvmaxNumber,"label":"MAX JEUNE"}],
              "typology": "YOUNG",
              "withoutSeatAssignment": false,
              "dateOfBirth":"1996-08-27"
            }
          ],
          "itineraryId": randomUUID(),
          "forceDisplayResults": true,
          "trainExpected": true,
          "strictMode": false,
          "directJourney": false
        });
        const headers = Object.assign({},Config.baseHeaders);
        headers['x-bff-key'] = Config.sncfApiKey;
        headers['Cookie'] = cookiesString;
        
        var config: AxiosRequestConfig  = {
          method: 'post',
          url: Config.baseSncfApiUrl,
          headers: headers,
          data : data
        };

        /**
         * get data from sncf.connect
         */
        const response: AxiosResponse = await Axios.request(config);
        const rawPageJourneys: ISncfRawJourney[] = response.data.longDistance.proposals.proposals as unknown as ISncfRawJourney[];
        const pageJourneys: IJourney[] = [];
        Object.values(rawPageJourneys).forEach((rawJourney: ISncfRawJourney)=>{
          if(rawJourney.status.isBookable){
            const journey: IJourney = {departureDate: rawJourney.travelId.split("_")[0],
                                       price: parseFloat(rawJourney.bestPriceLabel.slice(0,-2))};
            pageJourneys.push(journey);
          }

        })
        results.push(...pageJourneys);
        var departureDate = pageJourneys[pageJourneys.length - 1].departureDate;
        const pageLastTripDeparture: string = moment(departureDate)
        .tz('Europe/Paris').format('YYYY-MM-DD[T]HH:mm:ss');
        if (moment(departureMaxTime).isSameOrBefore(pageLastTripDeparture)
          || moment(departureMinTime).isSame(pageLastTripDeparture)) {
          keepSearching = false;
        }
        departureMinTime = pageLastTripDeparture;
      }
    } catch (error) {
      const status: number = get(error, 'response.status', ''); // tslint:disable-line
      const statusText: string = get(error, 'response.statusText', ''); // tslint:disable-line
      const label: string = get(error, 'response.data.label', ''); // tslint:disable-line
      console.log(`SNCF API ERROR : ${status} ${statusText} ${label}`); // tslint:disable-line
    }

    /**
     * 1/ filter out trains with no TGVmax seat available
     * 2/ filter out trains leaving after toTime
     */
    const tgvmaxTravels: IJourney[] = filter(results, (item: IJourney) => {
      const departureDate: string = moment(item.departureDate).tz('Europe/Paris').format('YYYY-MM-DD[T]HH:mm:ss');

      return item.price == 0 && moment(departureDate).isSameOrBefore(departureMaxTime);
    });

    return map(tgvmaxTravels, (tgvmaxTravel: IJourney) => {
      return moment(tgvmaxTravel.departureDate).tz('Europe/Paris').format('HH:mm');
    });
  }

}

export default new Sncf();
