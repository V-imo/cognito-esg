import { faker } from "@faker-js/faker";

const makeGenerator =
  <T>(generator: () => T) =>
  (overrides: Partial<T> = {}) => ({ ...generator(), ...overrides });

export type EmployeeCreatedEventInput = {
  agencyId: string;
  email: string;
  given_name: string;
  family_name: string;
};

export type EmployeeDeletedEventInput = {
  agencyId: string;
  employeeId: string;
};

export type InspectorCreatedEventInput = {
  agencyId: string;
  email: string;
  given_name: string;
  family_name: string;
};

export type InspectorDeletedEventInput = {
  agencyId: string;
  inspectorId: string;
};

export const generateEmployeeCreatedEventData =
  makeGenerator<EmployeeCreatedEventInput>(() => ({
    agencyId: `agency_${faker.string.uuid()}`,
    email: faker.internet.email().toLowerCase(),
    given_name: faker.person.firstName(),
    family_name: faker.person.lastName(),
  }));

export const generateEmployeeDeletedEventData =
  makeGenerator<EmployeeDeletedEventInput>(() => ({
    agencyId: `agency_${faker.string.uuid()}`,
    employeeId: faker.string.uuid(),
  }));

export const generateInspectorCreatedEventData =
  makeGenerator<InspectorCreatedEventInput>(() => ({
    agencyId: `agency_${faker.string.uuid()}`,
    email: faker.internet.email().toLowerCase(),
    given_name: faker.person.firstName(),
    family_name: faker.person.lastName(),
  }));

export const generateInspectorDeletedEventData =
  makeGenerator<InspectorDeletedEventInput>(() => ({
    agencyId: `agency_${faker.string.uuid()}`,
    inspectorId: faker.string.uuid(),
  }));

