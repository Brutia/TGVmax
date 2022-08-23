import Axios, { AxiosRequestConfig, AxiosRequestHeaders, AxiosResponse } from 'axios';
import { filter, get, isEmpty, isNil, map, uniq } from 'lodash';
import * as moment from 'moment-timezone';
import { randomUUID } from 'crypto'
import Config from '../../Config';
import { IAvailability, IConnectorParams, ITrainlineRawJourney, IJourney, ITrainlineAlternative, ITrainlineSection} from '../../types';

/**
 * Trainline connector
 */
class Trainline {
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
   * get data from trainline api
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
          url: Config.baseTrainlineUrl,
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
          'passengers': [
            {
              'id': randomUUID(),
              'dateOfBirth': "1996-08-27",
              'cardIds': [
                Config.trailineCardId
              ]
            }
          ],
          'isEurope': true,
          'cards': [
            {
              'id': Config.trailineCardId,
              'cardTypeId': Config.trainlineTgvmaxId,
              'number': tgvmaxNumber,
              'uuid': Config.trailineCardId
            }
          ],
          'transitDefinitions': [
              {
                  'direction': 'outward',
                  'origin': origin.trainlineId,
                  'destination': destination.trainlineId,
                  'journeyDate': {
                      'type': 'departAfter',
                      'time': departureMinTime
                  }
              }
          ],
          'type': 'single',
          'maximumJourneys': 5,
          'includeRealtime': true,
          'transportModes': [
              'mixed'
          ],
          'directSearch': false,
          'composition': [
              'through'
          ]
        });
        const headers: AxiosRequestHeaders = Object.assign({},Config.baseHeaders);
        headers['Cookie'] = cookiesString;
        headers['x-version'] = "4.6.22225";
        headers["origin"] = Config.baseTrainlineUrl;
        const config: AxiosRequestConfig  = {
          method: 'post',
          url: Config.baseTrainlineApiUrl,
          headers: headers,
          data : data
        };

        /**
         * get data from trainline
         */
        const response: AxiosResponse = await Axios.request(config);
        const rawPageJourneys: ITrainlineRawJourney[] = Object.values(response.data.data.journeySearch.journeys) as unknown as ITrainlineRawJourney[];
        const pageSections: ITrainlineSection[] = Object.values(response.data.data.journeySearch.sections) as unknown as ITrainlineSection[]
        const pageAlternatives: ITrainlineAlternative[] = Object.values(response.data.data.journeySearch.alternatives) as unknown as ITrainlineAlternative[]
        const pageJourneys: IJourney[] = [];
        for(const rawJourney of rawPageJourneys){
          const sectionsId: string[] = rawJourney.sections;
          if(sectionsId.length == 0){
            continue;
          }
          var journeyPrice: number = 0;
          sectionsId.forEach((sectionId: string) => {
            const section: ITrainlineSection | undefined = pageSections.find(element => element.id == sectionId);
            if(!isNil(section)){
              const alternativesId: string[] = section.alternatives;
              const minPrice: number = Math.min(...alternativesId.map((alternativeId: string) => {
                const alternative: ITrainlineAlternative | undefined = pageAlternatives.find(element => element.id == alternativeId);
                if(!isNil(alternative)){
                  return alternative.price.amount;
                }else{
                  return Infinity;
                }
              }));
              journeyPrice += minPrice;
            }
          });
          const journey: IJourney = {departureDate: rawJourney.departAt,
                                      price: journeyPrice};
          pageJourneys.push(journey);
        }
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
      console.log(`TRAINLINE API ERROR : ${status} ${statusText} ${label}`); // tslint:disable-line
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

export default new Trainline();
