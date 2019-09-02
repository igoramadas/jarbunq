declare const EmailAction: {
    (message: any): Promise<boolean>;
    defaultRule: {
        from: string;
        subject: string;
    };
};
export = EmailAction;
