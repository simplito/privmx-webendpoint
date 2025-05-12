import { VerificationRequest } from "../Types";

/**
 * An interface consisting of a single verify() method, which - when implemented - should perform verification of the provided data using an external service verification
 * should be done using an external service such as an application server or a PKI server.
 * 
 * @type {UserVerifierInterface}
 *  
*/
export interface UserVerifierInterface {
    /**
     * Verifies whether the specified users are valid.
     * Checks if each user belonged to the Context and if this is their key in `date` and return `true` or `false` otherwise.
     * 
     * @param request List of user data to verification
     * @returns List of verification results whose items correspond to the items in the input list
    */
    verify(request: VerificationRequest[]): Promise<boolean[]>;
}