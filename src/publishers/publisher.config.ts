// import {
// } from './handlers';

/**
 * Interface for publisher registration
 */
export interface IPublisherRegistration {
  publisherClass: any;
  config: {
    enabled: boolean;
    autoInitialize?: boolean;
  };
}

/**
 * Configuration array for registering service bus publishers.
 *
 * Each entry specifies the publisher class and its associated configuration,
 * including enabled status and auto-initialization flag.
 *
 * Publishers registered here can be injected into services and used to publish messages.
 *
 * @remarks
 * Extend this array to add more publisher configurations as needed.
 *
 * @see IPublisherRegistration
 */
export const SERVICE_BUS_PUBLISHER_CONFIG: IPublisherRegistration[] = [

];
