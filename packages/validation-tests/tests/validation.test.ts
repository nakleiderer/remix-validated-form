import { withYup } from "@remix-validated-form/with-yup/src";
import { withZod } from "@remix-validated-form/with-zod";
import { Validator } from "remix-validated-form/src";
import { objectFromPathEntries } from "remix-validated-form/src/internal/flatten";
import * as yup from "yup";
import { z } from "zod";
import { anyString, TestFormData } from "./util";

// If adding an adapter, write a validator that validates this shape
type Person = {
  firstName: string;
  lastName: string;
  age?: number;
  address: {
    streetAddress: string;
    city: string;
    country: string;
  };
  pets?: {
    animal: string;
    name: string;
  }[];
};

type ValidationTestCase = {
  name: string;
  validator: Validator<Person>;
};

const validationTestCases: ValidationTestCase[] = [
  {
    name: "yup",
    validator: withYup(
      yup.object({
        firstName: yup.string().required(),
        lastName: yup.string().required(),
        age: yup.number(),
        address: yup
          .object({
            streetAddress: yup.string().required(),
            city: yup.string().required(),
            country: yup.string().required(),
          })
          .required(),
        pets: yup.array().of(
          yup.object({
            animal: yup.string().required(),
            name: yup.string().required(),
          })
        ),
      })
    ),
  },
  {
    name: "zod",
    validator: withZod(
      z.object({
        firstName: z.string().nonempty(),
        lastName: z.string().nonempty(),
        age: z.optional(z.number()),
        address: z.preprocess(
          (value) => (value == null ? {} : value),
          z.object({
            streetAddress: z.string().nonempty(),
            city: z.string().nonempty(),
            country: z.string().nonempty(),
          })
        ),
        pets: z
          .object({
            animal: z.string().nonempty(),
            name: z.string().nonempty(),
          })
          .array()
          .optional(),
      })
    ),
  },
];

describe("Validation", () => {
  describe.each(validationTestCases)("Adapter for $name", ({ validator }) => {
    describe("validate", () => {
      it("should return the data when valid", async () => {
        const person: Person = {
          firstName: "John",
          lastName: "Doe",
          age: 30,
          address: {
            streetAddress: "123 Main St",
            city: "Anytown",
            country: "USA",
          },
          pets: [{ animal: "dog", name: "Fido" }],
        };
        expect(await validator.validate(person)).toEqual({
          data: person,
          error: undefined,
          submittedData: person,
        });
      });

      it("should return field errors when invalid", async () => {
        const obj = { age: "hi!", pets: [{ animal: "dog" }] };
        expect(await validator.validate(obj)).toEqual({
          data: undefined,
          error: {
            fieldErrors: {
              firstName: anyString,
              lastName: anyString,
              age: anyString,
              "address.city": anyString,
              "address.country": anyString,
              "address.streetAddress": anyString,
              "pets[0].name": anyString,
            },
            subaction: undefined,
          },
          submittedData: obj,
        });
      });

      it("should unflatten data when validating", async () => {
        const data = {
          firstName: "John",
          lastName: "Doe",
          age: 30,
          "address.streetAddress": "123 Main St",
          "address.city": "Anytown",
          "address.country": "USA",
          "pets[0].animal": "dog",
          "pets[0].name": "Fido",
        };
        expect(await validator.validate(data)).toEqual({
          data: {
            firstName: "John",
            lastName: "Doe",
            age: 30,
            address: {
              streetAddress: "123 Main St",
              city: "Anytown",
              country: "USA",
            },
            pets: [{ animal: "dog", name: "Fido" }],
          },
          error: undefined,
          submittedData: objectFromPathEntries(Object.entries(data)),
        });
      });

      it("should accept FormData directly and return errors", async () => {
        const formData = new TestFormData();
        formData.set("firstName", "John");
        formData.set("lastName", "Doe");
        formData.set("address.streetAddress", "123 Main St");
        formData.set("address.country", "USA");
        formData.set("pets[0].animal", "dog");

        expect(await validator.validate(formData)).toEqual({
          data: undefined,
          error: {
            fieldErrors: {
              "address.city": anyString,
              "pets[0].name": anyString,
            },
            subaction: undefined,
          },
          submittedData: objectFromPathEntries([...formData.entries()]),
        });
      });

      it("should accept FormData directly and return valid data", async () => {
        const formData = new TestFormData();
        formData.set("firstName", "John");
        formData.set("lastName", "Doe");
        formData.set("address.streetAddress", "123 Main St");
        formData.set("address.country", "USA");
        formData.set("address.city", "Anytown");
        formData.set("pets[0].animal", "dog");
        formData.set("pets[0].name", "Fido");

        expect(await validator.validate(formData)).toEqual({
          data: {
            firstName: "John",
            lastName: "Doe",
            address: {
              streetAddress: "123 Main St",
              country: "USA",
              city: "Anytown",
            },
            pets: [{ animal: "dog", name: "Fido" }],
          },
          error: undefined,
          subaction: undefined,
          submittedData: objectFromPathEntries([...formData.entries()]),
        });
      });

      it("should return the subaction in the ValidatorError if there is one", async () => {
        const person = {
          lastName: "Doe",
          age: 20,
          address: {
            streetAddress: "123 Main St",
            city: "Anytown",
            country: "USA",
          },
          pets: [{ animal: "dog", name: "Fido" }],
          subaction: "updatePerson",
        };
        expect(await validator.validate(person)).toEqual({
          error: {
            fieldErrors: {
              firstName: anyString,
            },
            subaction: "updatePerson",
          },
          data: undefined,
          submittedData: person,
        });
      });
    });

    describe("validateField", () => {
      it("should not return an error if field is valid", async () => {
        const person = {
          firstName: "John",
          lastName: {}, // invalid, but we should only be validating firstName
        };
        expect(await validator.validateField(person, "firstName")).toEqual({
          error: undefined,
        });
      });
      it("should not return an error if a nested field is valid", async () => {
        const person = {
          firstName: "John",
          lastName: {}, // invalid, but we should only be validating firstName
          address: {
            streetAddress: "123 Main St",
            city: "Anytown",
            country: "USA",
          },
          pets: [{ animal: "dog", name: "Fido" }],
        };
        expect(
          await validator.validateField(person, "address.streetAddress")
        ).toEqual({
          error: undefined,
        });
        expect(await validator.validateField(person, "address.city")).toEqual({
          error: undefined,
        });
        expect(
          await validator.validateField(person, "address.country")
        ).toEqual({
          error: undefined,
        });
        expect(await validator.validateField(person, "pets[0].animal")).toEqual(
          {
            error: undefined,
          }
        );
        expect(await validator.validateField(person, "pets[0].name")).toEqual({
          error: undefined,
        });
      });

      it("should return an error if field is invalid", async () => {
        const person = {
          firstName: "John",
          lastName: {},
          address: {
            streetAddress: "123 Main St",
            city: 1234,
          },
        };
        expect(await validator.validateField(person, "lastName")).toEqual({
          error: anyString,
        });
      });

      it("should return an error if a nested field is invalid", async () => {
        const person = {
          firstName: "John",
          lastName: {},
          address: {
            streetAddress: "123 Main St",
            city: 1234,
          },
          pets: [{ animal: "dog" }],
        };
        expect(
          await validator.validateField(person, "address.country")
        ).toEqual({
          error: anyString,
        });
        expect(await validator.validateField(person, "pets[0].name")).toEqual({
          error: anyString,
        });
      });
    });
  });
});
