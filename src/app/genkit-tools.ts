import { defineTool } from "@genkit-ai/ai";
import * as z from "zod";
import { setCustomMetadataAttribute } from "@genkit-ai/core/tracing";

export const readMenuTool = defineTool(
  {
    name: "readMenu",
    description: "Use this tool to see what is on any restaurant menu.",
    inputSchema: z.object({
      restaurant: z.string().describe("The name of the restaurant"),
    }),
    outputSchema: z.object({
      menuItems: z
        .array(z.string().describe("A food item"))
        .describe("An array of all the items on the menu"),
    }),
  },
  async (input: { restaurant: any }) => {
    setCustomMetadataAttribute("firebase/rc/param/menu_tool", "stable");
    console.log(`Reading the menu at ${input.restaurant}`);
    return {
      menuItems: ["Cheeseburger", "Fries"],
    };
  },
);

export const flakyMenuTool = defineTool(
  {
    name: "readMenuNew",
    description: "Use this tool to see what is on any restaurant menu.",
    inputSchema: z.object({
      restaurant: z.string().describe("The name of the restaurant"),
    }),
    outputSchema: z.object({
      menuItems: z
        .array(z.string().describe("A food item"))
        .describe("An array of all the items on the menu"),
    }),
  },
  async (input: { restaurant: any }) => {
    // Simulate an unreliable, experimental new endpoint
    setCustomMetadataAttribute("firebase/rc/param/menu_tool", "flaky");
    if (Math.random() > 0.5) {
      console.log(`Reading the menu at ${input.restaurant}`);
      return {
        menuItems: [
          "Hamburger",
          "Onion Rings",
          "Strawberry Shake",
          "Vanilla Froyo",
        ],
      };
    } else {
      throw new Error("The flaky new menu tool crashed again.");
    }
  },
);

export const makeReservationTool = defineTool(
  {
    name: "reserveTable",
    description: `Use this tool to reserve a table at any restaurant. 
      Make sure that you have all of the information from the customer 
      before attempting to make a reservation`,
    inputSchema: z.object({
      restaurant: z.string().describe("The name of the restaurant"),
      dateAndTime: z
        .string()
        .describe("The desired date and time of the reservation"),
      customerName: z
        .string()
        .describe("The customer name for the reservation"),
    }),
    outputSchema: z.object({
      reserved: z
        .boolean()
        .describe(
          "True if a table was reserved, or false if nothing was available",
        ),
      details: z
        .string()
        .describe("An explanantion for why the reservation was made or denied"),
    }),
  },
  async (input: { customerName: any; restaurant: any }) => {
    // Implement the tool...
    console.log(
      `Making a reservation for ${input.customerName} at ${input.restaurant}`,
    );
    return {
      reserved: false,
      details: "Busy signal",
    };
  },
);
